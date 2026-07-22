import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Teacher scheduling: place plans (and breaks/flexible/1:1) onto a child's day.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

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
    const { id, date, startMin, endMin } = body;
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
    await prisma.scheduleSlot.update({ where: { id }, data: { date, startMin, endMin } });
    return NextResponse.json({ ok: true });
  }

  if (op === "add") {
    const { childId, date, kind, lessonPlanId, startMin, endMin } = body;
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
            lessonPlanId: s.lessonPlanId,
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
    const source = await prisma.child.findUnique({ where: { id: childId } });
    if (!source) return NextResponse.json({ error: "child not found" }, { status: 404 });

    const sourceSlots = await prisma.scheduleSlot.findMany({
      where: { childId, date },
      orderBy: { startMin: "asc" },
    });
    if (sourceSlots.length === 0) {
      return NextResponse.json({ error: "This day is empty — nothing to copy." }, { status: 400 });
    }

    const others = await prisma.child.findMany({
      where: { teacherId: source.teacherId, id: { not: childId } },
    });

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
