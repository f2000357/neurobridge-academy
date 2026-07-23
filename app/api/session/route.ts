import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStandards } from "@/lib/standards";
import { tutorJson } from "@/lib/ai";
import { todayStr, nextMonday } from "@/lib/time";
import { nextGrade } from "@/lib/njsls";

// Session lifecycle + the ambient evaluation stream.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op, sessionId } = body as { op: string; sessionId: string };

  // Persist a resume snapshot so a closed/reopened browser lands in the same spot.
  if (op === "resume") {
    const { resumeData, pointsEarned } = body;
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        resumeData: typeof resumeData === "string" ? resumeData : JSON.stringify(resumeData ?? {}),
        ...(typeof pointsEarned === "number" ? { pointsEarned } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Award points for a correct answer — recorded immutably and totalled.
  if (op === "award") {
    const { childId, points, kind } = body as {
      childId: string;
      points: number;
      kind: string;
    };
    await prisma.pointEvent.create({
      data: { childId, sessionId, points, kind: kind ?? "core", date: todayStr() },
    });
    await prisma.child.update({ where: { id: childId }, data: { points: { increment: points } } });
    const s = await prisma.session.update({
      where: { id: sessionId },
      data: { pointsEarned: { increment: points } },
      select: { pointsEarned: true },
    });
    // Points collected today across all of this child's sessions.
    const todayAgg = await prisma.pointEvent.aggregate({
      where: { childId, date: todayStr() },
      _sum: { points: true },
    });
    return NextResponse.json({
      ok: true,
      sessionPoints: s.pointsEarned,
      todayPoints: todayAgg._sum.points ?? 0,
    });
  }

  if (op === "signal") {
    const { chunkIndex, kind, payload } = body;
    await prisma.evalSignal.create({
      data: { sessionId, chunkIndex: chunkIndex ?? 0, kind, payload: JSON.stringify(payload ?? {}) },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "state") {
    const { state, chunkProgress } = body;
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        ...(state ? { state } : {}),
        ...(chunkProgress ? { chunkProgress: JSON.stringify(chunkProgress) } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "complete") {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { state: "closed", endedAt: new Date() },
      include: {
        signals: true,
        child: { include: { profile: true } },
        slot: { include: { lessonPlan: true } },
      },
    });

    // Turn the signal stream into the guide's plain-language report.
    const answers = session.signals.filter((s) => s.kind === "answer");
    const rights = answers.filter((s) => JSON.parse(s.payload).correct).length;
    const simplifies = session.signals.filter((s) => s.kind === "simplify_request").length;

    // Grade the closing assessment: percent correct → mastery level.
    const score = answers.length > 0 ? Math.round((rights / answers.length) * 100) : null;
    const masteryLevel =
      score === null ? "" : score >= 80 ? "proficient" : score >= 50 ? "approaching" : "struggling";
    const summaryInput = {
      lesson: session.slot.lessonPlan?.title,
      answers: answers.map((s) => JSON.parse(s.payload)),
      simplifyRequests: simplifies,
      allSignals: session.signals.map((s) => ({ kind: s.kind, payload: s.payload })),
    };

    const note = await tutorJson<{ workedWell: string; stuckOn: string; nextStep: string }>(
      `You write short, plain-language progress notes for a teacher (a "guide") about a neurodiverse learner's AI-tutored session. Be specific and concrete. No jargon, no fluff.`,
      `Session data for ${session.child.name}: ${JSON.stringify(summaryInput)}. Write JSON: {"workedWell": "1-2 sentences", "stuckOn": "1-2 sentences (or 'Nothing notable' if smooth)", "nextStep": "one concrete suggestion"}`
    );

    await prisma.progressNote.create({
      data: {
        sessionId,
        workedWell:
          note?.workedWell ??
          `Completed the lesson. ${rights}/${answers.length || 0} practice answers correct.`,
        stuckOn:
          note?.stuckOn ??
          (simplifies > 0
            ? `Asked for simpler wording ${simplifies} time(s).`
            : "Nothing notable."),
        nextStep: note?.nextStep ?? "Continue as planned.",
        score,
        masteryLevel,
      },
    });

    // Skill fully done (proficient) → weekly homework + a next-level suggestion.
    let homeworkCreated = false;
    let advancementCreated = false;
    const plan = session.slot.lessonPlan;
    if (masteryLevel === "proficient" && plan) {
      const child = session.child;
      const std = getStandards(child.standardsCode);
      // 1) Weekly homework: a 10-question worksheet, due next Monday.
      try {
        const hw = await tutorJson<{ questions: { question: string; answer: string }[] }>(
          `You write short homework worksheets for neurodiverse learners, aligned to ${std.label}. Plain language.`,
          `Create a 10-question homework worksheet reinforcing "${plan.title}" (subject ${plan.subject}, Grade ${plan.gradeLevel || "?"}, strand ${plan.topic}, standard ${plan.standardCode}). ` +
            `Short questions, each with one short definite answer. JSON: {"questions": [{"question": "...", "answer": "..."}]} with exactly 10.`,
          2000,
          "plan"
        );
        const questions = (hw?.questions ?? []).slice(0, 10);
        if (questions.length > 0) {
          await prisma.homework.create({
            data: {
              childId: child.id,
              title: `Homework: ${plan.title}`,
              subject: plan.subject,
              topic: plan.topic,
              standardCode: plan.standardCode,
              questions: JSON.stringify(questions),
              dueDate: nextMonday(),
            },
          });
          homeworkCreated = true;
        }
      } catch (e) {
        console.error("homework generation failed", e);
      }

      // 2) Standards advancement: propose the next level up on the same topic.
      try {
        const up = nextGrade(plan.gradeLevel || "3");
        const adv = await tutorJson<{ title: string; standardCode: string; rationale: string }>(
          `You plan ${std.label}-aligned advancement for a neurodiverse learner who just mastered a skill. Plain language.`,
          `${child.name} just showed proficiency (${score}%) on "${plan.title}" — ${plan.subject}, Grade ${plan.gradeLevel}, strand "${plan.topic}", standard ${plan.standardCode}. ` +
            `Propose the NEXT advanced level on this same topic, at Grade ${up}, following the ${std.label} progression. ` +
            `JSON: {"title": "short lesson title", "standardCode": "the next ${std.label} standard code", "rationale": "one sentence: why this is the right next step"}`,
          800,
          "plan"
        );
        if (adv?.title) {
          // Attach to the child's proposal (create one if none).
          let proposal = await prisma.programProposal.findFirst({
            where: { childId: child.id },
            orderBy: { createdAt: "desc" },
          });
          if (!proposal) {
            proposal = await prisma.programProposal.create({
              data: { childId: child.id, summary: "Advancement suggestions based on mastered skills." },
            });
          }
          await prisma.proposedLesson.create({
            data: {
              proposalId: proposal.id,
              subject: plan.subject,
              grade: up,
              topic: plan.topic,
              standardCode: adv.standardCode ?? "",
              title: adv.title,
              rationale: adv.rationale ?? `Next level after mastering ${plan.title}.`,
              source: "advancement",
              status: "pending",
            },
          });
          advancementCreated = true;
        }
      } catch (e) {
        console.error("advancement suggestion failed", e);
      }
    }

    return NextResponse.json({ ok: true, score, masteryLevel, homeworkCreated, advancementCreated });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
