import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { planJsonFromDocs, tutorJson, aiEnabled, type DocInput } from "@/lib/ai";
import { usernameFrom } from "@/lib/username";
import { getStandards } from "@/lib/standards";
import { guardOperate, guardOperatorPresent } from "@/lib/authz";

// A friendly, unique URL handle from the child's name (append a number if taken).
async function uniqueUsername(name: string, excludeId?: string): Promise<string> {
  const base = usernameFrom(name);
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (
    await prisma.child.findFirst({
      where: { username: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

// Admin: set up children, upload their documents, and let the AI propose a
// program the guide approves or rejects.

type ProposedLessonJson = {
  subject: string;
  grade: string;
  topic: string;
  title: string;
  rationale: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  const newCode = () => String(Math.floor(10000000 + Math.random() * 90000000));

  // Authorization: "create" makes a new child under the current guide; every
  // other op targets an existing child — directly, or via a document / proposed
  // lesson we resolve back to its child. The caller must be able to operate it.
  if (op === "create") {
    const denied = await guardOperatorPresent();
    if (denied) return denied;
  } else {
    let targetChildId: string | undefined = body.childId;
    if (!targetChildId && body.documentId) {
      const d = await prisma.childDocument.findUnique({
        where: { id: body.documentId },
        select: { childId: true },
      });
      targetChildId = d?.childId;
    }
    if (!targetChildId && body.proposedLessonId) {
      const pl = await prisma.proposedLesson.findUnique({
        where: { id: body.proposedLessonId },
        select: { proposal: { select: { childId: true } } },
      });
      targetChildId = pl?.proposal.childId;
    }
    if (!targetChildId) return NextResponse.json({ error: "no learner specified" }, { status: 400 });
    const denied = await guardOperate(targetChildId);
    if (denied) return denied;
  }

  if (op === "create") {
    const teacher = await getCurrentUser();
    if (!teacher) return NextResponse.json({ error: "no guide" }, { status: 400 });
    const name = body.name?.trim() || "New child";
    const child = await prisma.child.create({
      data: {
        teacherId: teacher.id,
        centerId: teacher.centerId ?? null, // homeschool parent: no center

        name,
        username: await uniqueUsername(name),
        accessCode: newCode(),
        profile: { create: {} },
      },
    });
    return NextResponse.json({ ok: true, id: child.id });
  }

  if (op === "regenerateCode") {
    const child = await prisma.child.update({
      where: { id: body.childId },
      data: { accessCode: newCode() },
      select: { accessCode: true },
    });
    return NextResponse.json({ ok: true, accessCode: child.accessCode });
  }

  if (op === "save") {
    const { childId, name, age, interests, notes } = body;
    // Give the child a friendly URL handle if they don't have one yet.
    const existing = await prisma.child.findUnique({ where: { id: childId }, select: { username: true } });
    const username =
      !existing?.username && name?.trim() ? await uniqueUsername(name, childId) : undefined;
    await prisma.child.update({
      where: { id: childId },
      data: {
        name: name?.trim() || undefined,
        age: age === "" || age == null ? null : Number(age),
        ...(username ? { username } : {}),
      },
    });
    await prisma.childProfile.update({
      where: { childId },
      data: { interests: interests ?? "", iepNotes: notes ?? "" },
    });
    return NextResponse.json({ ok: true });
  }

  // The family's special-interest blocks: what, how often, how long, together?
  if (op === "setInterests") {
    const { childId, interests } = body as {
      childId: string;
      interests: {
        activity: string;
        sessionsPerWeek: number;
        slotsPerSession: number;
        backToBack: boolean;
      }[];
    };
    await prisma.childInterest.deleteMany({ where: { childId } });
    const clean = (interests ?? [])
      .filter((i) => i.activity)
      .map((i) => ({
        childId,
        activity: i.activity,
        sessionsPerWeek: Math.max(1, Math.min(5, Number(i.sessionsPerWeek) || 1)),
        slotsPerSession: Math.max(1, Math.min(4, Number(i.slotsPerSession) || 1)),
        backToBack: Boolean(i.backToBack),
      }));
    if (clean.length) await prisma.childInterest.createMany({ data: clean });
    return NextResponse.json({ ok: true, count: clean.length });
  }

  if (op === "removeDocument") {
    await prisma.childDocument.delete({ where: { id: body.documentId } });
    return NextResponse.json({ ok: true });
  }

  if (op === "generateProgram") {
    const { childId } = body;
    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: { profile: true, documents: true },
    });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });
    if (child.documents.length === 0) {
      return NextResponse.json(
        { error: "Upload at least one document (IEP, strengths, evaluation…) first." },
        { status: 400 }
      );
    }
    if (!aiEnabled) {
      return NextResponse.json(
        { error: "AI is not configured, so a program can't be generated from the documents yet." },
        { status: 200 }
      );
    }

    const docs: DocInput[] = child.documents.map((d) => ({
      mimeType: d.mimeType,
      data: d.data,
      filename: `${d.kind}: ${d.filename}`,
    }));

    const p = child.profile;
    const std = getStandards(child.standardsCode);
    const instruction =
      `You are reviewing the attached documents about ${child.name}` +
      (child.age != null ? `, age ${child.age}` : "") +
      `. They may include an IEP, an evaluation, a list of strengths, a practice-tool report ` +
      `(e.g. IXL or MobyMax showing per-skill mastery and standards), or other notes.` +
      (p?.interests ? ` Interests: ${p.interests}.` : "") +
      (p?.iepNotes ? ` Extra notes from the guide: ${p.iepNotes}.` : "") +
      ` From what these documents say about this child's current levels, goals, strengths, and needs, ` +
      `propose a starting program of 3-5 lessons aligned to ${std.name} (${std.label}). ` +
      `Meet the child at the level the documents indicate — do not assume a grade that isn't supported by the documents. ` +
      `For each lesson give: subject (one of: Math, ELA — Reading, ELA — Writing, Science, Social Studies, Life skills), ` +
      `grade ("K"-"12"), a ${std.label} strand/topic, a short title, and a one-sentence rationale that references what the documents say. ` +
      `JSON: {"summary": "2-3 sentences on the whole program and how it fits this child", ` +
      `"lessons": [{"subject": "...", "grade": "...", "topic": "...", "title": "...", "rationale": "..."}]}`;

    const result = await planJsonFromDocs<{ summary: string; lessons: ProposedLessonJson[] }>(
      "You design individualized homeschool programs for neurodiverse learners from their own documents (IEP, evaluations, strengths). Be specific, evidence-based, and encouraging. Plain text only. Keep each rationale to one sentence so the JSON stays compact.",
      instruction,
      docs,
      8000
    );

    if (!result || !Array.isArray(result.lessons)) {
      return NextResponse.json(
        { error: "Couldn't read a program from those documents. Try a clearer file, or add notes." },
        { status: 502 }
      );
    }

    // Replace any prior proposal for this child with the fresh one.
    await prisma.programProposal.deleteMany({ where: { childId } });
    const proposal = await prisma.programProposal.create({
      data: {
        childId,
        summary: result.summary ?? "",
        lessons: {
          create: result.lessons.slice(0, 6).map((l) => ({
            subject: l.subject ?? "General",
            grade: l.grade ?? "",
            topic: l.topic ?? "",
            title: l.title ?? "Untitled lesson",
            rationale: l.rationale ?? "",
          })),
        },
      },
      include: { lessons: true },
    });

    return NextResponse.json({ ok: true, proposal });
  }

  if (op === "rejectLesson") {
    await prisma.proposedLesson.update({
      where: { id: body.proposedLessonId },
      data: { status: "rejected" },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "approveLesson") {
    const proposed = await prisma.proposedLesson.findUnique({
      where: { id: body.proposedLessonId },
      include: { proposal: { include: { child: { include: { profile: true } } } } },
    });
    if (!proposed) return NextResponse.json({ error: "not found" }, { status: 404 });
    const child = proposed.proposal.child;
    const p = child.profile;
    const std = getStandards(child.standardsCode);

    // Materialize the approved outline into a full, ready lesson.
    const system = [
      `You design lesson plans for NeuroBridge, a calm school for neurodiverse learners, aligned to ${std.name} (${std.label}).`,
      "Chunk types: read_text (content), visual (content + optional visual name), video (videoNote, no invented URL), worksheet (items, seed_question, seed_answer), wrap_up.",
      "Include a worksheet assessment as the second-to-last chunk, then one wrap_up. Plain text only, no Markdown.",
      p?.readingLevel ? `Reading level: ${p.readingLevel}.` : "",
      p?.interests ? `Use the child's interests where natural: ${p.interests}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const draft = await tutorJson<{
      goal: string;
      whyItMatters: string;
      standardCode: string;
      standardText: string;
      chunks: unknown[];
    }>(
      system,
      `Build the lesson "${proposed.title}" (subject ${proposed.subject}, Grade ${proposed.grade}, strand ${proposed.topic}) for ${child.name}. ` +
        `Return JSON: {"goal": "...", "whyItMatters": "...", "standardCode": "${std.label} code", "standardText": "...", "chunks": [ ... ]} with 3-6 chunks ending in a worksheet then wrap_up.`,
      4000,
      "deep"
    );

    const chunks =
      draft?.chunks && Array.isArray(draft.chunks) && draft.chunks.length > 0
        ? draft.chunks
        : [
            { type: "read_text", title: proposed.title, content: `A lesson on ${proposed.topic}.`, read_aloud: true },
            { type: "worksheet", title: "Try it", items: 3, difficulty: "adaptive" },
            { type: "wrap_up", title: "Look what you did" },
          ];

    const plan = await prisma.lessonPlan.create({
      data: {
        teacherId: child.teacherId,
        childId: child.id,
        title: proposed.title,
        subject: proposed.subject,
        gradeLevel: proposed.grade,
        topic: proposed.topic,
        standardCode: draft?.standardCode ?? "",
        standardText: draft?.standardText ?? "",
        goal: draft?.goal ?? proposed.title,
        whyItMatters: draft?.whyItMatters ?? "",
        chunks: JSON.stringify(chunks),
        durationMin: 25,
        published: false, // approved into the library as a draft to review/schedule
      },
    });

    await prisma.proposedLesson.update({
      where: { id: proposed.id },
      data: { status: "approved", lessonPlanId: plan.id },
    });

    return NextResponse.json({ ok: true, lessonPlanId: plan.id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
