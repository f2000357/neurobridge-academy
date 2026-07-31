import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOperate } from "@/lib/authz";
import { tutorJson, aiEnabled } from "@/lib/ai";
import { gatherReport } from "@/lib/report";
import { gatherCoverage, gapSummary } from "@/lib/coverage";
import { availableStandards, gradeSpan } from "@/lib/contentIndex";
import { getStandards } from "@/lib/standards";
import { subjectKey } from "@/lib/subjects";
import { materializeWeeklyLesson } from "@/lib/weekLessons";

// A guide asking questions about the week they are looking at — and, when they
// want, telling it what to change.
//
// It NEVER writes on its own. Every change comes back as a proposal the guide
// applies, because this decides what a child does with their week and an
// assistant that quietly rewrote the plan would be a worse tool than no
// assistant at all.
//
// It sees what the report sees: scores, coverage gaps, therapist notes, IEP
// goals, the learning profile. That is the point — it should be able to say a
// lesson clashes with something the child's OT wrote, not just read the plan
// back.

// One shape only: re-plan a whole subject for the week.
//
// It used to offer per-lesson swaps, and that was the wrong unit. Asked to
// "start fractions", it returned 3.NF.A.3, 4.NF.A.1, 4.NF.B.4 and 4.NF.C.6 —
// four standards across two grades, dropped into a week with no relation to
// each other. A week of lessons is a RAMP: one standard, its skills in
// curriculum order, difficulty rising. That is exactly what the generator
// builds, so the assistant now asks for the same thing rather than inventing
// its own arrangement.
type Proposal = {
  kind: "replanSubject";
  subject: string;
  focus: string;
  standardCode: string;
  why: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "ask") {
    const { childId, weekStart, question, history } = body as {
      childId: string;
      weekStart: string;
      question: string;
      history?: { role: "user" | "assistant"; text: string }[];
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    if (!question?.trim()) return NextResponse.json({ error: "Ask something first." }, { status: 400 });
    if (!aiEnabled) {
      return NextResponse.json({ error: "The assistant needs AI, which isn't switched on." }, { status: 503 });
    }

    const [plan, report, child] = await Promise.all([
      prisma.weeklyPlan.findUnique({
        where: { childId_weekStart: { childId, weekStart } },
        include: { lessons: { orderBy: [{ subject: "asc" }, { date: "asc" }] } },
      }),
      gatherReport(childId),
      prisma.child.findUnique({
        where: { id: childId },
        select: { providers: true, standardsCode: true, gradeLevel: true, profile: true },
      }),
    ]);
    if (!plan) return NextResponse.json({ error: "There's no plan for that week yet." }, { status: 404 });

    // What it is allowed to choose from. Offering a standard we have no real
    // practice link for would produce a lesson that goes nowhere.
    const framework = getStandards(child?.standardsCode).code;
    // The same band the planner works in: from just below where he is working
    // up to the grade he is enrolled in. Offering only the enrolled grade let
    // it propose grade-5 swaps into a grade-3 week and nothing to remediate
    // with; offering only the working grade would never stretch him.
    const target = child?.gradeLevel || report?.child.workingGrade || "3";
    const band = gradeSpan(report?.child.workingGrade || target, target);
    const subjects = [...new Set(plan.lessons.map((l) => l.subject))];
    const choosable: Record<string, unknown> = {};
    for (const s of subjects) {
      choosable[s] = await availableStandards({
        subject: subjectKey(s),
        grades: band.length ? band : [target],
        framework,
        cap: 40,
      });
    }
    const { coverage } = await gatherCoverage(childId);

    const result = await tutorJson<{ reply: string; proposals?: Proposal[] }>(
      "You help a parent-guide think about their neurodiverse child's week of lessons. " +
        "You are talking to the adult, not the child: be direct and concrete, no baby talk, no empty reassurance. " +
        "Ground every claim in the data you are given and say plainly when the data does not answer the question. " +
        "Never invent a score, a note, or a standard code. " +
        "Propose changes ONLY when the guide asks for one or the data clearly warrants raising it, and keep proposals few.",
      `The guide asks: ${question}\n\n` +
        (history?.length ? `Earlier in this conversation: ${JSON.stringify(history.slice(-6))}\n\n` : "") +
        `THIS WEEK'S PLAN (${weekStart}): ${JSON.stringify(
          plan.lessons.map((l) => ({
            lessonId: l.id,
            subject: l.subject,
            focus: l.focus,
            date: l.date,
            level: l.level,
            topic: l.topic,
            standardCode: l.standardCode,
            title: l.title,
            rationale: l.rationale,
            done: Boolean(l.lessonPlanId),
          }))
        )}\n\n` +
        `THE CHILD: ${JSON.stringify(report?.child)}\n` +
        `SUBJECT LEVELS: ${JSON.stringify(report?.subjects)}\n` +
        `COVERAGE GAPS: ${JSON.stringify(gapSummary(coverage))}\n` +
        `RECENT NOTES FROM THE TEAM: ${JSON.stringify(report?.teacherNotes?.slice(0, 12) ?? [])}\n` +
        `IEP / PROFILE: ${JSON.stringify({
          iepNotes: child?.profile?.iepNotes ?? "",
          neverDo: child?.profile?.neverDo ?? "",
          interests: child?.profile?.interests ?? "",
        })}\n` +
        `He is enrolled in grade ${target} and working at grade ${report?.child.workingGrade || "?"}; keep moving him toward ${target} without skipping a prerequisite he genuinely lacks.\n` +
        `STANDARDS YOU MAY CHOOSE FROM, per subject (code, grade and skill name — anything else has no practice link): ${JSON.stringify(choosable)}\n\n` +
        `Answer the guide.\n\n` +
        `If they want the week's work changed, propose it as ONE re-plan per subject: ` +
        `{"kind":"replanSubject","subject","focus","standardCode","why"}. ` +
        `NEVER more than one proposal for the same subject, and never a mix of standards inside a subject.\n` +
        `A subject's week is a RAMP: one standard, its skills taken in curriculum order, difficulty rising ` +
        `across the days. Choosing several standards for one subject produces disconnected lessons and is wrong, ` +
        `even when they are all about the topic asked for. Pick the ONE standard that starts that topic where ` +
        `this child can begin, and say in "why" what the ramp will cover and what comes after it.\n` +
        `standardCode MUST be copied exactly from the list above for that subject. ` +
        `Prefer the lowest grade in that topic the child has not secured — build up, do not start midway.\n` +
        `JSON: {"reply": "your answer in plain sentences", "proposals": [ ... ]}`,
      // A reply plus proposals does not fit in 2000 — it was being cut off
      // mid-JSON, which parses as nothing and surfaced as "couldn't answer".
      // The same ceiling broke week generation; see lib/ai.ts, which now logs
      // when a call runs out of room.
      8000,
      "plan"
    );

    if (!result?.reply) {
      return NextResponse.json(
        { error: "That answer didn't come back in one piece. Try a shorter or more specific question." },
        { status: 502 }
      );
    }
    // Drop anything pointing at a lesson that isn't in this week, or a standard
    // we cannot actually link to — a proposal has to be applicable.
    const codesFor = (subject: string) =>
      new Set(((choosable[subject] as { standardCode: string }[]) ?? []).map((c) => c.standardCode));
    const subjectsInWeek = new Set(plan.lessons.map((l) => l.subject));
    const seen = new Set<string>();
    const proposals = (result.proposals ?? []).filter((p) => {
      if (p.kind !== "replanSubject") return false;
      if (!subjectsInWeek.has(p.subject) || !codesFor(p.subject).has(p.standardCode)) return false;
      // One per subject, whatever it returned — two re-plans of the same subject
      // is the incoherence this shape exists to prevent.
      if (seen.has(p.subject)) return false;
      seen.add(p.subject);
      return true;
    });

    return NextResponse.json({ ok: true, reply: result.reply, proposals });
  }

  // Applying one proposal, on the guide's say-so.
  //
  // Clearing lessonPlanId is what makes the change real: the next approve or
  // regenerate re-materialises that block against the new standard instead of
  // keeping the draft built for the old one.
  if (op === "apply") {
    const { childId, weekStart, proposal } = body as {
      childId: string;
      weekStart: string;
      proposal: Proposal;
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    const plan = await prisma.weeklyPlan.findUnique({
      where: { childId_weekStart: { childId, weekStart } },
      include: { lessons: true },
    });
    if (!plan) return NextResponse.json({ error: "There's no plan for that week." }, { status: 404 });

    if (proposal.kind !== "replanSubject") {
      return NextResponse.json({ error: "unknown proposal" }, { status: 400 });
    }

    // Re-plan the subject's whole week, exactly as the generator would: point
    // every unfinished block of that subject at the one standard, clear the
    // drafts, then rebuild them in order. materializeWeeklyLesson picks a
    // DISTINCT skill per block in curriculum order, so the week comes out as a
    // ramp rather than four unrelated lessons.
    //
    // Blocks he has already sat are left alone. Re-planning a week is not a
    // licence to rewrite what he did on Monday.
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: { id: true, teacherId: true, standardsCode: true, providers: true },
    });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });

    const affected = plan.lessons
      .filter((l) => l.subject === proposal.subject && l.status !== "approved")
      .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1));
    if (affected.length === 0) {
      return NextResponse.json({ error: "Every block in that subject is already on the schedule." }, { status: 400 });
    }

    await prisma.weeklyLesson.updateMany({
      where: { id: { in: affected.map((l) => l.id) } },
      data: {
        focus: proposal.focus || proposal.standardCode,
        standardCode: proposal.standardCode,
        rationale: proposal.why,
        lessonPlanId: null,
        status: "pending",
      },
    });

    const used = new Set<string>();
    for (const [i, l] of affected.entries()) {
      await materializeWeeklyLesson(
        {
          id: l.id,
          slotId: l.slotId,
          subject: l.subject,
          topic: "",
          standardCode: proposal.standardCode,
          title: l.title,
          // Position in the ramp, renumbered — the old order came from a
          // different standard and would pick skills out of sequence.
          order: i,
          lessonPlanId: null,
        },
        child,
        { publish: false, schedule: false, used }
      );
    }
    const rebuilt = await prisma.weeklyLesson.findMany({
      where: { id: { in: affected.map((l) => l.id) } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
      select: { date: true, title: true },
    });
    return NextResponse.json({ ok: true, changed: affected.length, rebuilt });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
