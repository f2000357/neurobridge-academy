import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDaysStr } from "@/lib/time";
import { tutorJson, aiEnabled } from "@/lib/ai";

// Weekly plan generator. Layer 1 (subject/flexible blocks) is already on the
// schedule; here we fill each subject with a focus + a difficulty ramp for the
// week, which the guide reviews and approves.

type SubjectPlan = {
  subject: string;
  focus: string;
  standardCode: string;
  lessons: { title: string; topic: string; level: number; rationale: string }[];
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "generate") {
    const { childId, weekStart } = body as { childId: string; weekStart: string };
    const child = await prisma.child.findUnique({ where: { id: childId }, include: { profile: true } });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });

    const dates = Array.from({ length: 5 }, (_, i) => addDaysStr(weekStart, i));
    const slots = await prisma.scheduleSlot.findMany({
      where: { childId, date: { in: dates }, kind: "lesson" },
      include: { lessonPlan: { select: { subject: true } } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    });
    if (slots.length === 0) {
      return NextResponse.json(
        { error: "This week has no lesson blocks yet. Set up the week's blocks first (Plan a day / Week)." },
        { status: 400 }
      );
    }
    if (!aiEnabled) {
      return NextResponse.json({ error: "AI is not configured, so a week can't be generated." }, { status: 200 });
    }

    // Group blocks by subject, in day/time order — that order IS the ramp.
    const bySubject = new Map<string, typeof slots>();
    for (const s of slots) {
      const subj = s.lessonPlan?.subject || "General";
      if (!bySubject.has(subj)) bySubject.set(subj, []);
      bySubject.get(subj)!.push(s);
    }

    // Where the child is, per subject, to pitch the starting point.
    const notes = await prisma.progressNote.findMany({
      where: { session: { childId }, score: { not: null } },
      include: { session: { include: { slot: { include: { lessonPlan: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const mastery: Record<string, number[]> = {};
    for (const n of notes) {
      const subj = n.session.slot.lessonPlan?.subject;
      if (subj && n.score != null) (mastery[subj] ??= []).push(n.score);
    }

    // The Friday check-in (weekly test) is the strongest signal for this week's plan.
    const test = await prisma.weeklyTest.findUnique({
      where: { childId_weekStart: { childId, weekStart } },
    });
    const testScores: Record<string, number> = test ? JSON.parse(test.scores) : {};

    const subjectsForPrompt = Array.from(bySubject.entries()).map(([subject, ss]) => ({
      subject,
      blocks: ss.length,
      testScore: testScores[subject] ?? null,
      recentScores: (mastery[subject] ?? []).slice(0, 5),
    }));

    const p = child.profile;
    const result = await tutorJson<{ subjects: SubjectPlan[] }>(
      "You design a week of NJSLS-aligned lessons for a neurodiverse learner. For each subject, pick a focus and build a lesson for each of its blocks so the difficulty rises across the week (start where the child is; each lesson a small step harder). Plain, encouraging language.",
      `Child: ${child.name}, age ${child.age ?? "?"}. Reading level: ${p?.readingLevel ?? "grade-3"}, math level: ${p?.mathLevel || "unknown"}. Interests: ${p?.interests || "unknown"}. ` +
        (test ? `They took a check-in test — testScore per subject (% correct) is the MAIN signal for where to start: low = reteach fundamentals, high = push ahead. ` : "") +
        `This week's subject blocks: ${JSON.stringify(subjectsForPrompt)} (testScore = this week's check-in %; recentScores = recent assessments). ` +
        `For EACH subject, return a "focus" (the week's skill), a best-fit "standardCode" (NJSLS), and a "lessons" array with exactly one lesson per block, in order, difficulty rising. ` +
        `Each lesson: {"title","topic" (NJSLS strand),"level" (1..N rising),"rationale" (one SHORT sentence: how it steps up)}. Keep rationales short so the JSON stays compact. ` +
        `JSON: {"subjects": [{"subject","focus","standardCode","lessons":[...]}]}`,
      5000,
      "plan"
    );

    if (!result?.subjects) {
      return NextResponse.json({ error: "Couldn't generate the week. Try again." }, { status: 502 });
    }

    // Replace any prior plan for this child+week.
    await prisma.weeklyPlan.deleteMany({ where: { childId, weekStart } });
    const plan = await prisma.weeklyPlan.create({ data: { childId, weekStart } });

    // Map each subject's generated lessons onto its ordered blocks.
    const rows = result.subjects.flatMap((sp) => {
      const blocks = bySubject.get(sp.subject) ?? [];
      return (sp.lessons ?? []).slice(0, blocks.length).map((l, i) => ({
        planId: plan.id,
        slotId: blocks[i].id,
        subject: sp.subject,
        focus: sp.focus ?? "",
        date: blocks[i].date,
        startMin: blocks[i].startMin,
        order: i,
        level: l.level ?? i + 1,
        topic: l.topic ?? "",
        standardCode: sp.standardCode ?? "",
        title: l.title ?? `${sp.subject} — day ${i + 1}`,
        rationale: l.rationale ?? "",
      }));
    });
    if (rows.length > 0) await prisma.weeklyLesson.createMany({ data: rows });

    return NextResponse.json({ ok: true, planId: plan.id, count: rows.length });
  }

  if (op === "approve") {
    await prisma.weeklyPlan.update({ where: { id: body.planId }, data: { status: "approved" } });
    return NextResponse.json({ ok: true });
  }

  // Turn one reviewed outline into a real, scheduled lesson (client loops these).
  if (op === "materializeOne") {
    const wl = await prisma.weeklyLesson.findUnique({
      where: { id: body.weeklyLessonId },
      include: { plan: { include: { child: { include: { profile: true } } } } },
    });
    if (!wl) return NextResponse.json({ error: "not found" }, { status: 404 });
    const child = wl.plan.child;
    const p = child.profile;

    const system = [
      "You design lesson plans for Neurable, a calm school for neurodiverse learners, aligned to NJSLS.",
      "Chunk types: read_text (content), visual (content + optional visual name), worksheet (items 3-5, seed_question, seed_answer), wrap_up.",
      "Include a worksheet assessment before one wrap_up. Plain text only, no Markdown.",
      p?.interests ? `Use the child's interests where natural: ${p.interests}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const draft = await tutorJson<{
      goal: string;
      whyItMatters: string;
      standardCode: string;
      standardText: string;
      gradeLevel: string;
      chunks: unknown[];
    }>(
      system,
      `Build the lesson "${wl.title}" for ${child.name}. Subject ${wl.subject}, weekly focus "${wl.focus}", strand ${wl.topic}, standard ${wl.standardCode}. ` +
        `This is step ${wl.level} in a rising-difficulty week, so pitch it accordingly. ` +
        `Return JSON: {"goal","whyItMatters","standardCode","standardText","gradeLevel" ("K"-"12"),"chunks":[...]} with 3-6 chunks ending worksheet then wrap_up.`,
      4000,
      "deep"
    );

    const chunks =
      draft?.chunks && Array.isArray(draft.chunks) && draft.chunks.length > 0
        ? draft.chunks
        : [
            { type: "read_text", title: wl.title, content: `A lesson on ${wl.topic || wl.focus}.`, read_aloud: true },
            { type: "worksheet", title: "Try it", items: 5 },
            { type: "wrap_up", title: "Look what you did" },
          ];

    const plan = await prisma.lessonPlan.create({
      data: {
        teacherId: child.teacherId,
        childId: child.id,
        title: wl.title,
        subject: wl.subject,
        gradeLevel: draft?.gradeLevel ?? "",
        topic: wl.topic,
        standardCode: draft?.standardCode || wl.standardCode,
        standardText: draft?.standardText ?? "",
        goal: draft?.goal ?? wl.title,
        whyItMatters: draft?.whyItMatters ?? "",
        chunks: JSON.stringify(chunks),
        durationMin: 45,
        published: true,
      },
    });

    // Point the schedule block at the new lesson.
    await prisma.scheduleSlot.update({ where: { id: wl.slotId }, data: { lessonPlanId: plan.id } });
    await prisma.weeklyLesson.update({ where: { id: wl.id }, data: { status: "approved", lessonPlanId: plan.id } });

    return NextResponse.json({ ok: true, lessonPlanId: plan.id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
