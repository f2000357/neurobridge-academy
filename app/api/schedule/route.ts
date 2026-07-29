import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { planInterestBlocks } from "@/lib/interestBlocks";
import { guardOperate, currentOperator } from "@/lib/authz";
import { rosterChildIds } from "@/lib/access";
import { addDaysStr } from "@/lib/time";
import { buildDayTemplate, normalizeStart } from "@/lib/dayTemplate";

// Teacher scheduling: place plans (and breaks/flexible/1:1) onto a child's day.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // Authorization: every op targets one child — directly via childId, or via a
  // slot id we resolve back to its child. The caller must be able to operate it.
  let targetChildId: string | undefined = body.childId;
  if (!targetChildId && body.id) {
    const slot = await prisma.scheduleSlot.findUnique({
      where: { id: body.id },
      select: { childId: true },
    });
    targetChildId = slot?.childId;
  }
  if (!targetChildId) return NextResponse.json({ error: "no learner specified" }, { status: 400 });
  const denied = await guardOperate(targetChildId);
  if (denied) return denied;

  if (op === "list") {
    const { childId, date } = body;
    const slots = await prisma.scheduleSlot.findMany({
      where: { childId, date },
      include: { lessonPlan: true, sessions: { select: { state: true } } },
      orderBy: { startMin: "asc" },
    });
    const absence = await prisma.absence.findUnique({ where: { childId_date: { childId, date } } });
    return NextResponse.json({ slots, absent: Boolean(absence) });
  }

  // Mark / unmark a child absent for a day.
  if (op === "setAbsent") {
    const { childId, date, absent } = body as { childId: string; date: string; absent: boolean };
    if (absent) {
      await prisma.absence.upsert({
        where: { childId_date: { childId, date } },
        create: { childId, date },
        update: {},
      });
    } else {
      await prisma.absence.deleteMany({ where: { childId, date } });
    }
    return NextResponse.json({ ok: true });
  }

  if (op === "listWeek") {
    const { childId, dates } = body as { childId: string; dates: string[] };
    const slots = await prisma.scheduleSlot.findMany({
      where: { childId, date: { in: dates } },
      include: {
        lessonPlan: { select: { title: true, subject: true } },
        sessions: { select: { state: true } },
      },
      orderBy: { startMin: "asc" },
    });
    return NextResponse.json({ slots });
  }

  if (op === "update") {
    const { id, date, startMin, endMin, teacherId } = body;
    if (endMin <= startMin) {
      return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    }
    const slot = await prisma.scheduleSlot.findUnique({ where: { id } });
    if (!slot) return NextResponse.json({ error: "slot not found" }, { status: 404 });
    // Overlap check on the target day, ignoring the slot being moved.
    const clash = await prisma.scheduleSlot.findFirst({
      where: {
        childId: slot.childId,
        date,
        id: { not: id },
        startMin: { lt: endMin },
        endMin: { gt: startMin },
      },
    });
    if (clash) {
      return NextResponse.json({ error: "overlap" }, { status: 409 });
    }
    await prisma.scheduleSlot.update({
      where: { id },
      data: {
        date,
        startMin,
        endMin,
        // Who is running this one. Per block, not per child: three piano
        // teachers on three slots is a normal week. `undefined` leaves it be;
        // an empty string clears it.
        ...(teacherId === undefined ? {} : { teacherId: teacherId || null }),
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Drop this child's special-interest blocks into a week. Afternoon-first so
  // mornings stay academic; the guide can move or cancel any of them after.
  if (op === "placeInterests") {
    const { childId, weekStart } = body as { childId: string; weekStart: string };
    const placed = await planInterestBlocks(childId, weekStart);
    if (placed.length === 0) {
      return NextResponse.json({
        ok: true,
        added: 0,
        note: "Nothing to place — either no interests are set, or the week is full.",
      });
    }
    await prisma.scheduleSlot.createMany({
      data: placed.map((p) => ({
        childId,
        date: p.date,
        kind: "flexible",
        activity: p.activity,
        startMin: p.startMin,
        endMin: p.endMin,
      })),
    });
    return NextResponse.json({ ok: true, added: placed.length });
  }

  // Two 30-minute assessment (check-in) slots on Friday at 2pm. The child takes
  // each on the provider (IXL/MAP deep link) or a native check-in.
  if (op === "placeAssessments") {
    const { childId, weekStart } = body as { childId: string; weekStart: string };
    const friday = addDaysStr(weekStart, 4);
    const wanted = [
      { startMin: 14 * 60, endMin: 14 * 60 + 30 }, // 2:00–2:30
      { startMin: 14 * 60 + 30, endMin: 15 * 60 }, // 2:30–3:00
    ];
    const existing = await prisma.scheduleSlot.findMany({
      where: { childId, date: friday },
      select: { startMin: true, endMin: true },
    });
    let added = 0;
    for (const w of wanted) {
      const clash = existing.some((e) => w.startMin < e.endMin && w.endMin > e.startMin);
      if (clash) continue;
      await prisma.scheduleSlot.create({
        data: { childId, date: friday, kind: "testing", startMin: w.startMin, endMin: w.endMin },
      });
      existing.push(w);
      added++;
    }
    return NextResponse.json({
      ok: true,
      added,
      note: added === 0 ? "Friday 2–3pm already has slots there." : undefined,
    });
  }

  // Set a child's configurable school-day start (9:00 / 9:30 / 10:00).
  if (op === "setDayStart") {
    const { childId, startMin } = body as { childId: string; startMin: number };
    await prisma.child.update({
      where: { id: childId },
      data: { dayStartMin: normalizeStart(startMin) },
    });
    return NextResponse.json({ ok: true, startMin: normalizeStart(startMin) });
  }

  // Lay down a "typical day": mandatory Education blocks front-loaded, a morning
  // break, catch-up flexible, lunch, one game-play slot, and extracurriculars to
  // 3pm. Non-destructive — places each block only where the day is free, so any
  // existing testing/service slots are preserved.
  if (op === "generateDay") {
    const { childId, date } = body as { childId: string; date: string };
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: { dayStartMin: true },
    });
    const startMin = normalizeStart(body.startMin ?? child?.dayStartMin);
    const blocks = buildDayTemplate(startMin);
    const existing = await prisma.scheduleSlot.findMany({
      where: { childId, date },
      select: { startMin: true, endMin: true },
    });
    const busy = existing.map((e) => ({ startMin: e.startMin, endMin: e.endMin }));
    let added = 0;
    let skipped = 0;
    for (const b of blocks) {
      const clash = busy.some((e) => b.startMin < e.endMin && b.endMin > e.startMin);
      if (clash) {
        skipped++;
        continue;
      }
      await prisma.scheduleSlot.create({
        data: {
          childId,
          date,
          kind: b.kind,
          subject: b.subject ?? "",
          activity: b.activity ?? "",
          startMin: b.startMin,
          endMin: b.endMin,
        },
      });
      busy.push({ startMin: b.startMin, endMin: b.endMin });
      added++;
    }
    return NextResponse.json({ ok: true, added, skipped, startMin });
  }

  // The same typical day across Mon–Fri. Non-destructive at the day level: a day
  // that already has slots is left alone.
  if (op === "generateWeek") {
    const { childId, weekStart } = body as { childId: string; weekStart: string };
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: { dayStartMin: true },
    });
    const startMin = normalizeStart(body.startMin ?? child?.dayStartMin);
    const blocks = buildDayTemplate(startMin);
    const dates = Array.from({ length: 5 }, (_, i) => addDaysStr(weekStart, i));
    let added = 0;
    let skippedDays = 0;
    for (const date of dates) {
      const count = await prisma.scheduleSlot.count({ where: { childId, date } });
      if (count > 0) {
        skippedDays++;
        continue;
      }
      await prisma.scheduleSlot.createMany({
        data: blocks.map((b) => ({
          childId,
          date,
          kind: b.kind,
          subject: b.subject ?? "",
          activity: b.activity ?? "",
          startMin: b.startMin,
          endMin: b.endMin,
        })),
      });
      added += blocks.length;
    }
    return NextResponse.json({ ok: true, added, skippedDays, startMin });
  }

  if (op === "add") {
    const { childId, date, kind, lessonPlanId, startMin, endMin, activity, teacherId, subject } = body;
    if (endMin <= startMin) {
      return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    }
    // Guard against overlapping slots on the same day — a calm day needs clean edges.
    const clash = await prisma.scheduleSlot.findFirst({
      where: { childId, date, startMin: { lt: endMin }, endMin: { gt: startMin } },
    });
    if (clash) {
      return NextResponse.json(
        { error: "That time overlaps another slot. Pick a free time." },
        { status: 409 }
      );
    }
    const slot = await prisma.scheduleSlot.create({
      data: {
        childId,
        date,
        kind,
        lessonPlanId: kind === "lesson" ? lessonPlanId || null : null,
        // A mandatory Education block carries its subject before content is attached.
        subject: kind === "lesson" ? subject || "" : "",
        // Only flexible periods (electives) and related services carry one.
        activity: kind === "flexible" || kind === "service" ? activity || "" : "",
        // A visiting specialist holding this block, if the guide named one.
        teacherId: teacherId || null,
        startMin,
        endMin,
      },
    });
    return NextResponse.json({ ok: true, id: slot.id });
  }

  if (op === "copyWeek") {
    // Repeat one week's slots forward into the next `weeks` weeks (same weekday/time).
    const { childId, fromDates, weeks } = body as {
      childId: string;
      fromDates: string[]; // the 5 dates of the source week (Mon–Fri)
      weeks: number;
    };
    const source = await prisma.scheduleSlot.findMany({
      where: { childId, date: { in: fromDates } },
      orderBy: { startMin: "asc" },
    });
    if (source.length === 0) {
      return NextResponse.json({ error: "This week is empty — nothing to repeat." }, { status: 400 });
    }
    const shift = (dateStr: string, days: number) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + days);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    };

    let filled = 0;
    let skippedDays = 0;
    for (let w = 1; w <= weeks; w++) {
      const targetDates = fromDates.map((d) => shift(d, w * 7));
      // Non-destructive: skip any target day that already has slots.
      const existing = await prisma.scheduleSlot.findMany({
        where: { childId, date: { in: targetDates } },
        select: { date: true },
      });
      const busyDays = new Set(existing.map((e) => e.date));
      const toCreate = source
        .map((s) => ({ s, targetDate: shift(s.date, w * 7) }))
        .filter(({ targetDate }) => {
          if (busyDays.has(targetDate)) {
            skippedDays++;
            return false;
          }
          return true;
        });
      for (const { s, targetDate } of toCreate) {
        await prisma.scheduleSlot.create({
          data: {
            childId,
            date: targetDate,
            kind: s.kind,
            // The SHAPE of the week repeats; the lessons in it do not.
            //
            // This used to carry lessonPlanId, so copying a week forward
            // stamped that week's actual lessons onto every future week. The
            // planner then found every block already full and correctly
            // declined to overwrite them — which read as "generate does
            // nothing for next week", when what it was really doing was
            // refusing to throw away content someone had put there.
            //
            // Subject and activity ARE shape: a Monday-morning maths block is
            // still maths next week. Dropping them left the generator guessing
            // from an empty subject.
            subject: s.subject,
            activity: s.activity,
            startMin: s.startMin,
            endMin: s.endMin,
          },
        });
        filled++;
      }
    }
    return NextResponse.json({ ok: true, filled, skippedDays });
  }

  if (op === "copyToAll") {
    const { childId, date } = body;
    const source = await prisma.child.findUnique({ where: { id: childId }, select: { id: true } });
    if (!source) return NextResponse.json({ error: "child not found" }, { status: 404 });

    const sourceSlots = await prisma.scheduleSlot.findMany({
      where: { childId, date },
      orderBy: { startMin: "asc" },
    });
    if (sourceSlots.length === 0) {
      return NextResponse.json({ error: "This day is empty — nothing to copy." }, { status: 400 });
    }

    // "All" means all the learners the CALLER works with — never everyone who
    // happens to hang off the source child's primary guide. Read the other way
    // round, a second guide on one child could write a day into that primary's
    // whole family, none of whom they have any access to.
    const me = await currentOperator();
    if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const rosterIds = (await rosterChildIds(me)).filter((id) => id !== childId);
    const others = rosterIds.length
      ? await prisma.child.findMany({ where: { id: { in: rosterIds }, archived: false } })
      : [];

    const results: { name: string; added: number; skipped: number }[] = [];
    for (const child of others) {
      const existing = await prisma.scheduleSlot.findMany({
        where: { childId: child.id, date },
        select: { startMin: true, endMin: true },
      });
      let added = 0;
      let skipped = 0;
      for (const s of sourceSlots) {
        // Non-destructive: only place a slot where the target's day is free.
        const clashes = existing.some((e) => s.startMin < e.endMin && s.endMin > e.startMin);
        if (clashes) {
          skipped++;
          continue;
        }
        // A lesson customized for a different child shouldn't be delivered to this one;
        // copy its period shape as flexible time instead of the specific lesson.
        let kind = s.kind;
        let lessonPlanId: string | null = s.lessonPlanId;
        if (s.kind === "lesson" && s.lessonPlanId) {
          const plan = await prisma.lessonPlan.findUnique({ where: { id: s.lessonPlanId } });
          if (plan && plan.childId && plan.childId !== child.id) {
            kind = "flexible";
            lessonPlanId = null;
          }
        }
        await prisma.scheduleSlot.create({
          data: { childId: child.id, date, kind, lessonPlanId, startMin: s.startMin, endMin: s.endMin },
        });
        existing.push({ startMin: s.startMin, endMin: s.endMin });
        added++;
      }
      results.push({ name: child.name, added, skipped });
    }

    return NextResponse.json({ ok: true, results });
  }

  if (op === "remove") {
    const { id } = body;
    // Sessions reference the slot; clear them first (signals/notes cascade).
    await prisma.session.deleteMany({ where: { slotId: id } });
    await prisma.scheduleSlot.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
