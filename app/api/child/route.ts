import { NextRequest, NextResponse } from "next/server";
import { providerName } from "@/lib/providers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { planJsonFromDocs, aiEnabled, type DocInput } from "@/lib/ai";
import { subjectKey } from "@/lib/subjects";
import {
  childProviders,
  contentForStandard,
  contentForSkillName,
  preferredOrder,
  providerBrowseUrl,
} from "@/lib/contentIndex";
import { usernameFrom } from "@/lib/username";
import { getStandards, standardsForState } from "@/lib/standards";
import { guardOperate, guardOperatorPresent } from "@/lib/authz";
import { assessmentById } from "@/lib/assessments";

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

type IepReviewJson = {
  standing: string;
  goals: { area: string; goal: string; status: string; evidence: string }[];
  goingWell: string[];
  concerns: string[];
  focus: string[];
  asks: { type: string; text: string; rationale: string }[];
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
    const { childId, name, age, interests, notes, providers, gradeLevel, stateCode } = body;
    // Give the child a friendly URL handle if they don't have one yet.
    const existing = await prisma.child.findUnique({ where: { id: childId }, select: { username: true } });
    const username =
      !existing?.username && name?.trim() ? await uniqueUsername(name, childId) : undefined;
    await prisma.child.update({
      where: { id: childId },
      data: {
        name: name?.trim() || undefined,
        age: age === "" || age == null ? null : Number(age),
        ...(typeof gradeLevel === "string" ? { gradeLevel } : {}),
        // The family's state, and the standards framework it resolves to. Only
        // NJ is implemented; everyone else gets it as the closest match, which
        // the Setup screen says plainly rather than hiding.
        ...(typeof stateCode === "string"
          ? {
              stateCode: stateCode.toUpperCase(),
              standardsCode: standardsForState(stateCode).provider.code,
            }
          : {}),
        ...(username ? { username } : {}),
        // The family's subscriptions, CSV (drives which deep links we emit). An
        // empty string is meaningful — "we have none" — so it must persist too.
        ...(typeof providers === "string" ? { providers: providers.trim() } : {}),
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

  // Next page of a child's lessons (newest-first) — the profile loads them on
  // request instead of all at once.
  if (op === "lessonsPage") {
    const { childId, skip } = body as { childId: string; skip?: number };
    const take = 10;
    const rows = await prisma.lessonPlan.findMany({
      where: { childId },
      orderBy: { updatedAt: "desc" },
      skip: Math.max(0, Number(skip) || 0),
      take: take + 1,
      select: { id: true, title: true, subject: true, gradeLevel: true, standardCode: true, published: true },
    });
    return NextResponse.json({ ok: true, lessons: rows.slice(0, take), hasMore: rows.length > take });
  }

  // IEP support: read the child's IEP + the school's progress report + MAP scores
  // and draft what's working, what isn't, where to focus, and new asks for the
  // IEP team. A preparation aid — never legal advice; strictly grounded in the docs.
  if (op === "iepReview") {
    const { childId, documentIds } = body as { childId: string; documentIds?: string[] };
    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: { profile: true, documents: true },
    });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });
    // Only the documents the parent picked (default: all).
    const useDocs =
      Array.isArray(documentIds) && documentIds.length > 0
        ? child.documents.filter((d) => documentIds.includes(d.id))
        : child.documents;
    if (useDocs.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one document — upload the IEP, progress report, and MAP in Setup first." },
        { status: 400 }
      );
    }
    if (!aiEnabled) {
      return NextResponse.json({ error: "AI is not configured, so an IEP review can't be generated yet." }, { status: 200 });
    }

    // Generating is compute-expensive, so gate it BEFORE the AI call:
    //  - change-detection: refuse if these exact documents were already reviewed;
    //  - hard cap: at most MAX_REVIEWS non-archived reviews per child.
    // A NeuroBridge admin archives old reviews to reset both.
    const MAX_REVIEWS = 3;
    const signature = useDocs.map((d) => d.id).sort().join(",");
    const live = await prisma.iepReview.findMany({
      where: { childId, archived: false },
      select: { signature: true },
    });
    if (live.some((r) => r.signature === signature)) {
      return NextResponse.json({
        error:
          "These are the same documents as a previous review — nothing new to analyze. Upload a new IEP or MAP to refresh, or ask a NeuroBridge admin to archive past reviews.",
      });
    }
    if (live.length >= MAX_REVIEWS) {
      return NextResponse.json({
        error: `Reached the limit of ${MAX_REVIEWS} reviews for ${child.name}. Ask a NeuroBridge admin to archive past reviews to make room.`,
      });
    }

    const docs: DocInput[] = useDocs.map((d) => ({
      mimeType: d.mimeType,
      data: d.data,
      filename: `${d.kind}: ${d.filename}`,
    }));

    const p = child.profile;
    const instruction =
      `Read the attached documents about ${child.name}` +
      (child.age != null ? `, age ${child.age}` : "") +
      `. They may include an IEP (present levels, annual goals, accommodations, services), the school's IEP PROGRESS REPORT (an update on each goal), and MAP scores (RIT, percentile, growth).` +
      (p?.interests ? ` Interests: ${p.interests}.` : "") +
      (p?.iepNotes ? ` Notes from the parent/guide: ${p.iepNotes}.` : "") +
      ` You are helping this child's PARENT prepare for the next IEP meeting. Be strictly faithful to the documents — quote goals and scores; never invent a number or a fact. Frame every suggestion as something to DISCUSS with the IEP team, not a demand or a promise. ` +
      `Produce JSON: {` +
      `"standing": "2-3 plain sentences on where ${child.name} is now, citing MAP scores/percentile and trend if present", ` +
      `"goals": [ for EACH annual goal in the IEP: {"area": "e.g. Reading fluency", "goal": "the goal in a short phrase", "status": "on_track" | "stalled" | "met" | "unclear", "evidence": "what the progress report or MAP shows about it"} ], ` +
      `"goingWell": ["short bullets — strengths and goals that are progressing"], ` +
      `"concerns": ["short bullets — goals not moving, regressions, or gaps between the IEP and the current data; name any document you'd expect but that is missing"], ` +
      `"focus": ["short bullets — the 2-4 highest priorities to raise"], ` +
      `"asks": [ {"type": "goal" | "accommodation" | "service" | "question", "text": "a specific, measurable draft ask (a SMART goal, an accommodation, a service, or a question for the team)", "rationale": "one sentence tying it to the documents/data"} ] ` +
      `}. Keep every string concise so the JSON stays compact.`;

    const result = await planJsonFromDocs<IepReviewJson>(
      "You help parents of neurodiverse children prepare for IEP meetings by reading their own documents (the IEP, the school's progress report, MAP scores). You are evidence-based, faithful to the documents, warm, and empowering — but you are NOT a lawyer, you never give legal advice, and you never guarantee outcomes. Plain text only, no markdown.",
      instruction,
      docs,
      6000
    );
    if (!result || !result.standing) {
      return NextResponse.json(
        { error: "Couldn't read a review from those documents. Try clearer files — the IEP and progress report help most." },
        { status: 502 }
      );
    }

    const saved = await prisma.iepReview.create({
      data: { childId, result: JSON.stringify(result), docCount: useDocs.length, signature },
    });
    return NextResponse.json({ ok: true, review: result, createdAt: saved.createdAt, docCount: useDocs.length });
  }

  // Tests the family plans to take off-platform. We store the intent and the
  // result they type back in — never a registration, never a proctored test.
  if (op === "planTest") {
    const { childId, testId } = body as { childId: string; testId: string };
    if (!assessmentById(testId)) return NextResponse.json({ error: "unknown test" }, { status: 400 });
    const row = await prisma.assessmentPlan.create({ data: { childId, testId } });
    return NextResponse.json({ ok: true, id: row.id });
  }

  if (op === "updateTest" || op === "removeTest") {
    const { childId, planId } = body as { childId: string; planId: string };
    const row = await prisma.assessmentPlan.findUnique({ where: { id: planId } });
    if (!row || row.childId !== childId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (op === "removeTest") {
      await prisma.assessmentPlan.delete({ where: { id: planId } });
      return NextResponse.json({ ok: true });
    }
    const { status, testDate, score, notes } = body as {
      status?: string;
      testDate?: string;
      score?: string;
      notes?: string;
    };
    const updated = await prisma.assessmentPlan.update({
      where: { id: planId },
      data: {
        ...(status ? { status } : {}),
        ...(testDate != null ? { testDate } : {}),
        ...(score != null ? { score } : {}),
        ...(notes != null ? { notes } : {}),
      },
    });

    // A recorded MAP score also updates the profile's RIT fields, so the weekly
    // planner and the IEP review pick it up without re-typing it anywhere.
    const test = assessmentById(updated.testId);
    if (test?.feedsRit && updated.status === "taken" && updated.score) {
      const num = (re: RegExp) => {
        const m = updated.score.match(re);
        return m ? Number(m[1]) : undefined;
      };
      const math = num(/math[^0-9]{0,12}(\d{3})/i);
      const reading = num(/read[^0-9]{0,12}(\d{3})/i);
      const language = num(/lang[^0-9]{0,12}(\d{3})/i);
      if (math || reading || language) {
        await prisma.childProfile.update({
          where: { childId },
          data: {
            ...(math ? { mapMathRit: math } : {}),
            ...(reading ? { mapReadingRit: reading } : {}),
            ...(language ? { mapLanguageRit: language } : {}),
            ...(updated.testDate ? { mapTerm: updated.testDate } : {}),
          },
        });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // A NeuroBridge admin archives a child's past IEP reviews (frees the cap).
  if (op === "archiveIepReviews") {
    const me = await getCurrentUser();
    if (me?.role !== "neurable_admin") {
      return NextResponse.json({ error: "Only a NeuroBridge admin can archive reviews." }, { status: 403 });
    }
    const { childId } = body as { childId: string };
    const r = await prisma.iepReview.updateMany({ where: { childId, archived: false }, data: { archived: true } });
    return NextResponse.json({ ok: true, archived: r.count });
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
      include: { proposal: { include: { child: true } } },
    });
    if (!proposed) return NextResponse.json({ error: "not found" }, { status: 404 });
    const child = proposed.proposal.child;
    const framework = getStandards(child.standardsCode).code;
    const providers = childProviders(child.providers);
    const subjKey = subjectKey(proposed.subject);

    // Index-driven: the exact IXL skill for the standard, no AI content.
    let links = await contentForStandard({ standardCode: proposed.standardCode, providers, framework });
    if (links.length === 0 && proposed.topic) {
      links = await contentForSkillName({ skill: proposed.topic, providers, framework });
    }
    const order = preferredOrder(providers);
    links.sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
    const best = links[0];

    // Nothing indexed for this standard? Fall back to a canonical skill name.
    let skillHint = "";
    if (!best && proposed.standardCode) {
      const anyLinks = await contentForStandard({ standardCode: proposed.standardCode, providers: ["ixl"], framework });
      skillHint = anyLinks[0]?.skillName ?? "";
    }

    const provider = best?.provider ?? order[0] ?? "ixl";
    const skillName = best?.skillName || skillHint || proposed.topic || proposed.title;
    const videoUrl = best?.videoUrl || "";
    const practiceUrl =
      best?.practiceUrl || providerBrowseUrl(provider, subjKey, best?.gradeLevel || proposed.grade);
    const label = providerName(provider);
    // Title from the real skill it links to — what you read is what you practice.
    const lessonTitle = skillName;

    const chunk = {
      type: "practice",
      title: lessonTitle,
      provider,
      videoUrl,
      practiceUrl,
      content: `Today: ${skillName}. Watch the video on ${label}, then do the practice. Come back here when you're finished.`,
    };

    const plan = await prisma.lessonPlan.create({
      data: {
        teacherId: child.teacherId,
        childId: child.id,
        title: lessonTitle,
        subject: proposed.subject,
        gradeLevel: best?.gradeLevel || proposed.grade,
        topic: skillName,
        standardCode: proposed.standardCode,
        standardText: "",
        goal: `Practice: ${skillName}`,
        whyItMatters: "",
        workUrl: practiceUrl,
        chunks: JSON.stringify([chunk]),
        durationMin: 25,
        published: false, // approved into the library as a draft to review/schedule
      },
    });

    await prisma.proposedLesson.update({
      where: { id: proposed.id },
      data: { status: "approved", lessonPlanId: plan.id },
    });

    return NextResponse.json({ ok: true, lessonPlanId: plan.id, provider, indexed: Boolean(best) });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
