import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStandards } from "@/lib/standards";
import { tutorJson, aiEnabled } from "@/lib/ai";
import { todayStr, nextMonday } from "@/lib/time";
import { guardSession } from "@/lib/authz";

// The weekly standardized check-in: a few standards-aligned questions per subject. The
// per-subject scores become the strongest signal for next week's plan.

type TQ = { subject: string; question: string; answer: string };

const DEFAULT_SUBJECTS = ["Math", "ELA — Reading", "ELA — Writing", "Science / Social"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // Both ops name the child; require the child themselves or their operator.
  if (!body.childId) return NextResponse.json({ error: "no learner specified" }, { status: 400 });
  const denied = await guardSession(body.childId);
  if (denied) return denied;

  if (op === "generate") {
    const { childId } = body;
    const child = await prisma.child.findUnique({ where: { id: childId }, include: { profile: true } });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });

    // Subjects the child is actually working on (fall back to the core set).
    const recentSlots = await prisma.scheduleSlot.findMany({
      where: { childId, kind: "lesson" },
      include: { lessonPlan: { select: { subject: true } } },
      take: 40,
    });
    const subjects = Array.from(
      new Set(recentSlots.map((s) => s.lessonPlan?.subject).filter(Boolean) as string[])
    );
    const useSubjects = subjects.length > 0 ? subjects : DEFAULT_SUBJECTS;

    const p = child.profile;
    const fallback: TQ[] = useSubjects.flatMap((subject) => [
      { subject, question: `A ${subject} question.`, answer: "" },
    ]);
    if (!aiEnabled) return NextResponse.json({ questions: fallback, ai: false });

    const result = await tutorJson<{ questions: TQ[] }>(
      `You write a short standardized check-in (${getStandards(child.standardsCode).label}-aligned) for a neurodiverse learner. Plain, clear questions with one short definite answer each.`,
      `Child: ${child.name}. Reading level ${p?.readingLevel ?? "grade-3"}, math level ${p?.mathLevel || "grade-3"}. ` +
        `Write 2 questions for EACH of these subjects: ${useSubjects.join(", ")}. Grade-appropriate, one short answer each. ` +
        `JSON: {"questions":[{"subject","question","answer"}]}`,
      2000,
      "plan"
    );
    return NextResponse.json({ questions: result?.questions ?? fallback, ai: aiEnabled });
  }

  if (op === "submit") {
    const { childId, slotId, results } = body as {
      childId: string;
      slotId: string;
      results: { subject: string; correct: boolean }[];
    };
    // Per-subject percent correct.
    const bySubject: Record<string, { c: number; t: number }> = {};
    for (const r of results) {
      const b = (bySubject[r.subject] ??= { c: 0, t: 0 });
      b.t += 1;
      if (r.correct) b.c += 1;
    }
    const scores: Record<string, number> = {};
    for (const [subj, { c, t }] of Object.entries(bySubject)) {
      scores[subj] = t > 0 ? Math.round((c / t) * 100) : 0;
    }

    const slot = await prisma.scheduleSlot.findUnique({ where: { id: slotId } });
    const informsWeek = nextMonday(slot?.date ?? todayStr()); // the week this test shapes

    await prisma.weeklyTest.upsert({
      where: { childId_weekStart: { childId, weekStart: informsWeek } },
      create: { childId, weekStart: informsWeek, takenOn: todayStr(), scores: JSON.stringify(scores) },
      update: { takenOn: todayStr(), scores: JSON.stringify(scores) },
    });

    // Mark the testing block done + a few points for finishing.
    if (slot) {
      await prisma.session.create({
        data: { slotId, childId, state: "closed", endedAt: new Date() },
      });
    }
    const totalCorrect = results.filter((r) => r.correct).length; // 1 point per correct
    if (totalCorrect > 0) {
      await prisma.pointEvent.create({
        data: { childId, points: totalCorrect, kind: "test", date: todayStr() },
      });
      await prisma.child.update({ where: { id: childId }, data: { points: { increment: totalCorrect } } });
    }

    return NextResponse.json({ ok: true, scores, informsWeek });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
