import { NextRequest, NextResponse } from "next/server";
import { providerName } from "@/lib/providers";
import { prisma } from "@/lib/prisma";
import { guardSession, guardOperate, canOperateChild } from "@/lib/authz";
import { getCurrentTeacher } from "@/lib/teacherAuth";
import { todayStr } from "@/lib/time";
import { planJsonFromDocs, aiEnabled } from "@/lib/ai";

// Guide validation of provider (IXL) work done off-platform.
// The child marks a provider lesson done; the guide opens the work, reads the
// accuracy, and confirms — coins = floor(accuracy/10), 0-10. Native points only.

// Below this accuracy (or if the child abandoned it), the skill isn't mastered
// and should be repeated — the guide can drop the repeat into a Flex block.
export const MASTERY = 100;

export function coinsForAccuracy(accuracy: number): number {
  if (!Number.isFinite(accuracy)) return 0;
  return Math.max(0, Math.min(10, Math.floor(accuracy / 10)));
}

// Reverse a prior coin award tied to a completion (re-validating / undoing).
async function reverseAward(c: { id: string; childId: string; coins: number; pointEventId: string | null }) {
  if (!c.pointEventId) return;
  await prisma.pointEvent.deleteMany({ where: { id: c.pointEventId } });
  if (c.coins) await prisma.child.update({ where: { id: c.childId }, data: { points: { decrement: c.coins } } });
}

// Award coins to a child, returning the point-event id (null if 0 coins).
async function award(childId: string, coins: number): Promise<string | null> {
  if (coins <= 0) return null;
  const pe = await prisma.pointEvent.create({
    data: { childId, points: coins, kind: "provider", date: todayStr() },
  });
  await prisma.child.update({ where: { id: childId }, data: { points: { increment: coins } } });
  return pe.id;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // The child finished a provider lesson and came back to mark it done.
  if (op === "submit") {
    const { childId, slotId, title, provider, practiceUrl } = body as {
      childId: string;
      slotId?: string;
      title?: string;
      provider?: string;
      practiceUrl?: string;
    };
    const denied = await guardSession(childId);
    if (denied) return denied;
    // Don't stack duplicates for the same slot while one is still pending.
    if (slotId) {
      const open = await prisma.providerCompletion.findFirst({
        where: { childId, slotId, status: "pending" },
      });
      if (open) return NextResponse.json({ ok: true, id: open.id, pending: true });
    }
    const c = await prisma.providerCompletion.create({
      data: {
        childId,
        slotId: slotId || null,
        title: title || "Practice",
        provider: provider || "",
        practiceUrl: practiceUrl || "",
      },
    });
    return NextResponse.json({ ok: true, id: c.id, pending: true });
  }

  // Read the score off a photo of the child's own screen.
  //
  // The guide is usually not on the family's IXL account and the password is not
  // theirs to have, so the number they are asked to type is one they cannot see.
  // They can see the screen, though — they are sitting next to him.
  //
  // What that screen actually shows is SmartScore, questions answered and time.
  // There is no correct-answer count anywhere in IXL: wrong answers appear only
  // as dips in the SmartScore graph. So we stopped trying to derive a percentage
  // and keep SmartScore for what it is.
  //
  // This only READS. Nothing is scored until an adult confirms the number, which
  // matters because this awards points and vision misreads.
  if (op === "readScore") {
    const { childId, slotId, imageBase64, mimeType } = body as {
      childId: string;
      slotId?: string;
      imageBase64: string;
      mimeType: string;
    };
    // The child is the one pressing "I'm done", with the guide beside them, so
    // this is a session-level action rather than an operator-only one.
    const denied = await guardSession(childId);
    if (denied) return denied;
    if (!imageBase64) return NextResponse.json({ error: "No image received." }, { status: 400 });
    if (!aiEnabled) {
      return NextResponse.json({ error: "Reading scores needs AI, which isn't switched on." }, { status: 503 });
    }

    const read = await planJsonFromDocs<{
      skill: string | null;
      smartScore: number | null;
      answered: number | null;
      minutes: number | null;
      note: string | null;
    }>(
      "You read a screenshot of an IXL 'Questions log' / skill summary and report the numbers on it. " +
        "Never guess: if a number is not clearly legible, return null for it. " +
        "Read only the printed figures — never infer anything from the graph.",
      'Read the Skill summary panel. JSON: {"skill": "the skill name beside SKILL:, or null", ' +
        '"smartScore": the CURRENT SMARTSCORE number or null, ' +
        '"answered": the QUESTIONS ANSWERED number or null, ' +
        '"minutes": the TIME SPENT in whole minutes or null, ' +
        '"note": "one short sentence on anything unclear, or null"}',
      [{ mimeType: mimeType || "image/jpeg", data: imageBase64, filename: "score.jpg" }],
      400
    );

    if (!read || read.smartScore == null) {
      return NextResponse.json({
        ok: true,
        read: false,
        reason:
          read?.note ??
          "Couldn't find a SmartScore in that picture — capture the Skill summary panel, or type it in.",
      });
    }
    // IXL does not publish a correct-answer count anywhere: the skill summary
    // carries SmartScore, questions answered and time, and wrong answers show up
    // only as dips in a graph. So SmartScore IS the score we keep — on its own
    // scale, where IXL means 80 proficient, 90 excellent, 100 mastered. That
    // happens to line up with the 90 already used here for mastery.
    const score = Math.max(0, Math.min(100, Math.round(read.smartScore)));

    // Park it on the pending row so the guide arrives to a filled-in number
    // rather than an empty box. Still `pending` — reading is not validating.
    if (slotId) {
      const open = await prisma.providerCompletion.findFirst({
        where: { childId, slotId, status: "pending" },
        select: { id: true },
      });
      if (open) await prisma.providerCompletion.update({ where: { id: open.id }, data: { accuracy: score } });
    }
    // 25 questions in a minute is not 25 questions' worth of thinking. Worth
    // saying out loud rather than scoring it silently.
    const rushed =
      read.answered != null && read.minutes != null && read.minutes > 0 && read.answered / read.minutes >= 12;
    return NextResponse.json({
      ok: true,
      read: true,
      skill: read.skill,
      smartScore: score,
      answered: read.answered,
      minutes: read.minutes,
      accuracy: score,
      rushed,
      note: read.note,
    });
  }

  // Guide checked the work: enter the actual score, or mark it abandoned. Coins
  // = floor(accuracy/10). Below 90% (or abandoned) the skill isn't mastered and
  // needs a repeat, which the guide can drop into a Flex block (scheduleRepeat).
  if (op === "confirm") {
    const { id, accuracy, abandoned } = body as { id: string; accuracy?: number; abandoned?: boolean };
    const c = await prisma.providerCompletion.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    const denied = await guardOperate(c.childId);
    if (denied) return denied;

    await reverseAward(c); // re-validating with a new score

    if (abandoned) {
      await prisma.providerCompletion.update({
        where: { id },
        data: { accuracy: null, coins: 0, status: "abandoned", pointEventId: null, validatedAt: new Date() },
      });
      return NextResponse.json({ ok: true, abandoned: true, mastered: false, needsRepeat: true });
    }

    const acc = Math.max(0, Math.min(100, Math.round(Number(accuracy))));
    const coins = coinsForAccuracy(acc);
    const pointEventId = await award(c.childId, coins);
    await prisma.providerCompletion.update({
      where: { id },
      data: { accuracy: acc, coins, status: "validated", pointEventId, validatedAt: new Date() },
    });
    const mastered = acc >= MASTERY;
    return NextResponse.json({ ok: true, coins, accuracy: acc, mastered, needsRepeat: !mastered });
  }

  // Guide rejects / undoes a completion (nothing done, or a mistaken validation).
  if (op === "reject") {
    const { id } = body as { id: string };
    const c = await prisma.providerCompletion.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    const denied = await guardOperate(c.childId);
    if (denied) return denied;
    await reverseAward(c);
    await prisma.providerCompletion.update({
      where: { id },
      data: { status: "rejected", coins: 0, pointEventId: null },
    });
    return NextResponse.json({ ok: true });
  }

  // Guide logs EXTRA work the child did on their own (e.g. self-advanced to the
  // next IXL skill) — a validated completion + coins in one step, no scheduled
  // slot needed. A mastered (>=90%) skill also un-schedules any upcoming copy of
  // itself so the plan doesn't re-assign it.
  // Points for a session someone supervised in person — piano, XR, art, a
  // therapy block. There is no provider score here: the adult who was in the
  // room says how it went.
  //
  // Awardable by an operator, OR by the specialist the parent put on that block.
  // That is the same rule as writing the note, for the same reason: they are the
  // only person who saw it happen. One award per session either way — the
  // unique [childId, slotId] makes double-paying impossible, and a second call
  // edits the first rather than stacking.
  if (op === "awardSession") {
    const { childId, slotId, coins, title } = body as {
      childId: string;
      slotId: string;
      coins: number;
      title?: string;
    };
    if (!slotId) return NextResponse.json({ error: "Which session?" }, { status: 400 });

    const slot = await prisma.scheduleSlot.findUnique({
      where: { id: slotId },
      select: { childId: true, teacherId: true, activity: true },
    });
    if (!slot || slot.childId !== childId) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const asOperator = await canOperateChild(childId);
    if (!asOperator) {
      const teacher = await getCurrentTeacher();
      if (!teacher || slot.teacherId !== teacher.id) {
        return NextResponse.json(
          { error: "That session isn't yours to award points for." },
          { status: 403 }
        );
      }
    }

    const give = Math.max(0, Math.min(10, Math.round(Number(coins))));
    const existing = await prisma.providerCompletion.findUnique({
      where: { childId_slotId: { childId, slotId } },
    });
    if (existing) await reverseAward(existing); // editing, not stacking

    const pointEventId = await award(childId, give);
    const c = await prisma.providerCompletion.upsert({
      where: { childId_slotId: { childId, slotId } },
      create: {
        childId,
        slotId,
        title: (title || slot.activity || "Session").slice(0, 120),
        provider: "",
        practiceUrl: "",
        accuracy: null,
        coins: give,
        status: "validated",
        pointEventId,
        validatedAt: new Date(),
      },
      update: {
        title: (title || slot.activity || "Session").slice(0, 120),
        coins: give,
        status: "validated",
        pointEventId,
        validatedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, id: c.id, coins: give });
  }

  if (op === "logExtra") {
    const { childId, title, provider, practiceUrl, accuracy, abandoned } = body as {
      childId: string;
      title?: string;
      provider?: string;
      practiceUrl?: string;
      accuracy?: number;
      abandoned?: boolean;
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;

    const acc = abandoned ? null : Math.max(0, Math.min(100, Math.round(Number(accuracy))));
    const coins = acc == null ? 0 : coinsForAccuracy(acc);
    const pointEventId = await award(childId, coins);
    const c = await prisma.providerCompletion.create({
      data: {
        childId,
        slotId: null,
        title: title || "Extra practice",
        provider: provider || "",
        practiceUrl: practiceUrl || "",
        accuracy: acc,
        coins,
        status: abandoned ? "abandoned" : "validated",
        pointEventId,
        validatedAt: new Date(),
      },
    });

    // Feedback loop: a mastered skill shouldn't be re-taught — detach it from any
    // upcoming slots (within the plan) that link to the same skill.
    let adjusted = 0;
    const mastered = !abandoned && acc != null && acc >= MASTERY;
    if (mastered && practiceUrl) {
      const dupes = await prisma.scheduleSlot.findMany({
        where: { childId, date: { gte: todayStr() }, lessonPlan: { workUrl: practiceUrl } },
        select: { id: true },
      });
      for (const s of dupes) {
        await prisma.scheduleSlot.update({ where: { id: s.id }, data: { lessonPlanId: null } });
        adjusted++;
      }
    }
    return NextResponse.json({ ok: true, id: c.id, coins, mastered, needsRepeat: !mastered, adjusted });
  }

  // Guide schedules a repeat of an unmastered skill into a chosen Flex block.
  if (op === "scheduleRepeat") {
    const { childId, slotId, title, provider, practiceUrl } = body as {
      childId: string;
      slotId: string;
      title?: string;
      provider?: string;
      practiceUrl?: string;
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    const slot = await prisma.scheduleSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.childId !== childId) {
      return NextResponse.json({ error: "slot not found" }, { status: 404 });
    }
    const child = await prisma.child.findUnique({ where: { id: childId }, select: { teacherId: true } });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });
    const label = providerName(provider);
    const skill = title || "this skill";
    const chunk = {
      type: "practice",
      title: `Try again: ${skill}`,
      provider: provider || "",
      videoUrl: "",
      practiceUrl: practiceUrl || "",
      content: `Let's practice ${skill} again. Open ${label}, do the practice, then come back here.`,
    };
    const plan = await prisma.lessonPlan.create({
      data: {
        teacherId: child.teacherId,
        childId,
        title: `Repeat: ${skill}`,
        subject: slot.subject || "",
        gradeLevel: "",
        topic: skill,
        standardCode: "",
        standardText: "",
        goal: `Master: ${skill}`,
        whyItMatters: "",
        workUrl: practiceUrl || "",
        chunks: JSON.stringify([chunk]),
        durationMin: 25,
        published: true,
      },
    });
    // Use the Flex time for the repeat: turn the block into a startable lesson.
    await prisma.scheduleSlot.update({
      where: { id: slotId },
      data: { lessonPlanId: plan.id, kind: "lesson" },
    });
    return NextResponse.json({ ok: true, lessonPlanId: plan.id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
