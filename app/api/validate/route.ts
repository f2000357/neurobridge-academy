import { NextRequest, NextResponse } from "next/server";
import { providerName } from "@/lib/providers";
import { prisma } from "@/lib/prisma";
import { guardSession, guardOperate, canOperateChild } from "@/lib/authz";
import { getCurrentTeacher } from "@/lib/teacherAuth";
import { todayStr } from "@/lib/time";

// Guide validation of provider (IXL) work done off-platform.
// The child marks a provider lesson done; the guide opens the work, reads the
// accuracy, and confirms — coins = floor(accuracy/10), 0-10. Native points only.

// Below this accuracy (or if the child abandoned it), the skill isn't mastered
// and should be repeated — the guide can drop the repeat into a Flex block.
export const MASTERY = 90;

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
