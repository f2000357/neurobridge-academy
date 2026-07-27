import { NextRequest, NextResponse } from "next/server";
import { providerName } from "@/lib/providers";
import { prisma } from "@/lib/prisma";
import { addDaysStr, withinPlanningHorizon, todayStr } from "@/lib/time";
import { tutorJson, aiEnabled } from "@/lib/ai";
import { gatherCoverage, gapSummary } from "@/lib/coverage";
import { getStandards } from "@/lib/standards";
import { guardOperate } from "@/lib/authz";
import { subjectKey } from "@/lib/subjects";
import {
  childProviders,
  contentForStandard,
  contentForSkillName,
  preferredOrder,
  providerBrowseUrl,
  availableStandards,
  gradeSpan,
} from "@/lib/contentIndex";

// Grade order, for working out how far behind the target a learner is.
const GRADE_ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Weekly plan generator. Layer 1 (subject/flexible blocks) is already on the
// schedule; here we fill each subject with a focus + a difficulty ramp for the
// week, which the guide reviews and approves.

type SubjectPlan = {
  subject: string;
  focus: string;
  standardCode: string;
  lessons: { title: string; topic: string; level: number; rationale: string }[];
};

type WLRow = {
  id: string;
  slotId: string;
  subject: string;
  topic: string;
  standardCode: string;
  title: string;
  order: number; // block's position in the subject's week — used to pick a distinct skill
  lessonPlanId: string | null;
};
type ChildRow = {
  id: string;
  teacherId: string;
  standardsCode: string | null;
  providers: string;
};

// Practice URLs the child has already MASTERED (validated at >=90%). The planner
// skips these so a fresh week advances instead of re-teaching mastered skills.
async function masteredSkillUrls(childId: string): Promise<Set<string>> {
  const rows = await prisma.providerCompletion.findMany({
    where: { childId, status: "validated", accuracy: { gte: 90 }, practiceUrl: { not: "" } },
    select: { practiceUrl: true },
  });
  return new Set(rows.map((r) => r.practiceUrl));
}

// Build the real, index-driven lesson for one weekly-lesson outline. No AI-
// authored content: the AI chose the standard, the index supplies the exact
// IXL skill for the child's providers (deterministic order).
//   publish:false, schedule:false = a preview DRAFT the guide can review/edit
//     before approving (created at generate time).
//   publish:true, schedule:true   = live on the child's day (at approve time).
// If the weekly lesson already has a draft attached, we PUBLISH that existing
// plan rather than rebuild it — so the guide's edits survive approval.
async function materializeWeeklyLesson(
  wl: WLRow,
  child: ChildRow,
  opts: { publish: boolean; schedule: boolean; doneUrls?: Set<string> }
) {
  const doneUrls = opts.doneUrls ?? new Set<string>();
  const framework = getStandards(child.standardsCode).code;
  const providers = childProviders(child.providers);
  const subjKey = subjectKey(wl.subject);

  let planId = wl.lessonPlanId;
  if (!planId) {
    // Find the real skills for the standard, then pick a DISTINCT one per block so
    // the week's blocks ramp through actual IXL skills (skillCode-ordered ≈
    // curriculum order) instead of all linking the same first skill.
    let links = await contentForStandard({ standardCode: wl.standardCode, providers, framework });
    if (links.length === 0 && wl.topic) {
      links = await contentForSkillName({ skill: wl.topic, providers, framework });
    }
    const order = preferredOrder(providers);
    // The child's preferred platform that actually has skills for this standard.
    const provider = order.find((p) => links.some((l) => l.provider === p)) ?? order[0] ?? "ixl";
    const providerLinks = links.filter((l) => l.provider === provider); // skillCode-ordered
    // Skip skills the child has already MASTERED, so the ramp advances instead of
    // re-assigning them. If they've mastered everything, fall back to the full set.
    const fresh = providerLinks.filter((l) => !doneUrls.has(l.practiceUrl));
    const pool = fresh.length ? fresh : providerLinks;
    const best = pool.length ? pool[wl.order % pool.length] : undefined;

    // Nothing indexed for this standard on the child's platform? Fall back to a
    // canonical skill name so the lesson still reads sensibly.
    let skillHint = "";
    if (!best && wl.standardCode) {
      const anyLinks = await contentForStandard({ standardCode: wl.standardCode, providers: ["ixl"], framework });
      if (anyLinks.length) skillHint = anyLinks[wl.order % anyLinks.length].skillName;
    }

    const grade = best?.gradeLevel || "";
    const skillName = best?.skillName || skillHint || wl.topic || wl.title;
    const videoUrl = best?.videoUrl || "";
    const practiceUrl = best?.practiceUrl || providerBrowseUrl(provider, subjKey, grade);
    const label = providerName(provider);

    // Title the lesson after the REAL skill it links to — what you read is what
    // you'll practice. (The AI's rationale is kept as the "why" in the week review.)
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
        subject: wl.subject,
        gradeLevel: grade,
        topic: skillName,
        standardCode: wl.standardCode,
        standardText: "",
        goal: `Practice: ${skillName}`,
        whyItMatters: "",
        workUrl: practiceUrl,
        chunks: JSON.stringify([chunk]),
        durationMin: 25,
        published: opts.publish,
      },
    });
    planId = plan.id;

    // Sync the weekly-lesson title to the real skill so the review ramp and the
    // child's day show the truth, not the AI's (possibly inaccurate) framing.
    // (lessonPlanId + status are set by the shared update below.)
    await prisma.weeklyLesson.update({
      where: { id: wl.id },
      data: { title: lessonTitle, topic: skillName },
    });
  } else if (opts.publish) {
    // Existing draft (maybe guide-edited) — just flip it live.
    await prisma.lessonPlan.update({ where: { id: planId }, data: { published: true } });
  }

  await prisma.weeklyLesson.update({
    where: { id: wl.id },
    data: { lessonPlanId: planId, status: opts.publish ? "approved" : "draft" },
  });
  if (opts.schedule) {
    await prisma.scheduleSlot.update({ where: { id: wl.slotId }, data: { lessonPlanId: planId } });
  }
  return planId;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // Authorization: resolve the child this op plans for — directly (generate),
  // via the weekly plan (approve), or via the weekly lesson (materializeOne).
  let targetChildId: string | undefined = body.childId;
  if (!targetChildId && body.planId) {
    const wp = await prisma.weeklyPlan.findUnique({
      where: { id: body.planId },
      select: { childId: true },
    });
    targetChildId = wp?.childId;
  }
  if (!targetChildId && body.weeklyLessonId) {
    const wl = await prisma.weeklyLesson.findUnique({
      where: { id: body.weeklyLessonId },
      select: { plan: { select: { childId: true } } },
    });
    targetChildId = wl?.plan.childId;
  }
  if (!targetChildId) return NextResponse.json({ error: "no learner specified" }, { status: 400 });
  const denied = await guardOperate(targetChildId);
  if (denied) return denied;

  if (op === "generate") {
    const { childId, weekStart } = body as { childId: string; weekStart: string };
    // Lessons are planned a week at a time and must stay responsive to how the
    // child is doing — so generate only this week or next, never further out.
    // (The timetable itself can be laid down as far ahead as you like.)
    if (!withinPlanningHorizon(weekStart)) {
      return NextResponse.json(
        { error: "Lessons are planned one week at a time — generate this week or next, not further out. (Things change.)" },
        { status: 400 }
      );
    }
    const child = await prisma.child.findUnique({ where: { id: childId }, include: { profile: true } });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });

    const dates = Array.from({ length: 5 }, (_, i) => addDaysStr(weekStart, i));
    const allSlots = await prisma.scheduleSlot.findMany({
      where: { childId, date: { in: dates }, kind: "lesson" },
      include: {
        lessonPlan: { select: { subject: true, workUrl: true } },
        sessions: { select: { state: true } },
      },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    });
    // A lesson block's subject: its attached content's subject, else the subject
    // the day template stamped on the empty Education block.
    const slotSubject = (s: (typeof allSlots)[number]) => s.lessonPlan?.subject || s.subject || "General";
    if (allSlots.length === 0) {
      return NextResponse.json(
        { error: "This week has no lesson blocks yet. Set up the week's blocks first (Plan a day / Week)." },
        { status: 400 }
      );
    }
    if (!aiEnabled) {
      return NextResponse.json({ error: "AI is not configured, so a week can't be generated." }, { status: 200 });
    }

    // Only plan UPCOMING sessions — today or later, not already completed. Past
    // and finished lessons are history and stay exactly as they are.
    const today = todayStr();
    const isDone = (s: (typeof allSlots)[number]) => s.sessions.some((x) => x.state === "closed");

    // Upcoming blocks that still need content.
    //
    // A block that ALREADY has a lesson the child simply hasn't got to is not a
    // free slot — it is unfinished work. Regeneration used to overwrite those,
    // because "no closed session" looked the same as "empty", so a Monday the
    // child missed came back on Tuesday as a different skill entirely. The one
    // exception is a lesson since mastered elsewhere: that is genuinely stale
    // and should be replaced.
    const doneAlready = await masteredSkillUrls(childId);
    const stale = (s: (typeof allSlots)[number]) =>
      Boolean(s.lessonPlan?.workUrl) && doneAlready.has(s.lessonPlan!.workUrl);

    const upcoming = allSlots.filter((s) => s.date >= today && !isDone(s));
    const carried = upcoming.filter((s) => s.lessonPlanId && !stale(s));
    const slots = upcoming.filter((s) => !s.lessonPlanId || stale(s));
    let upcomingSlotIds = slots.map((s) => s.id);
    if (slots.length === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
        note: carried.length
          ? `Every upcoming block already has a lesson waiting (${carried.length}). Nothing was replaced — finish those, or unapprove one to swap it.`
          : "No upcoming sessions left this week — past lessons stay as they are. Generate next week instead.",
      });
    }

    // Work the child missed. A lesson sitting on a past day with no session was
    // never started — it should follow them forward rather than quietly vanish
    // into history. Each one takes the earliest free block of its own subject.
    const missed = await prisma.scheduleSlot.findMany({
      where: {
        childId,
        date: { lt: today },
        kind: "lesson",
        lessonPlanId: { not: null },
        sessions: { none: { state: "closed" } },
      },
      include: { lessonPlan: { select: { subject: true, workUrl: true } } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    });

    let carriedForward = 0;
    const takenBySubject = new Map<string, typeof slots>();
    for (const s of slots) {
      const k = slotSubject(s);
      if (!takenBySubject.has(k)) takenBySubject.set(k, []);
      takenBySubject.get(k)!.push(s);
    }
    // Anything already waiting on an upcoming block does not need carrying
    // again — otherwise each regenerate would copy the same missed lesson into
    // one more slot.
    const alreadyAhead = new Set(
      upcoming.map((s) => s.lessonPlanId).filter((id): id is string => Boolean(id))
    );
    for (const m of missed) {
      if (m.lessonPlan?.workUrl && doneAlready.has(m.lessonPlan.workUrl)) continue; // since mastered
      if (m.lessonPlanId && alreadyAhead.has(m.lessonPlanId)) continue; // already rescheduled
      if (m.lessonPlanId) alreadyAhead.add(m.lessonPlanId);
      const queue = takenBySubject.get(m.lessonPlan?.subject ?? "") ?? [];
      const target = queue.shift();
      if (!target) continue; // no room this week; it stays where it is
      // Give the missed lesson a future block — and leave Monday exactly as it
      // was. History is a record of what was planned and what happened; a
      // regenerate should never edit a day that has already been lived. The
      // past block keeps its lesson, unstarted, which is the truth of it.
      await prisma.scheduleSlot.update({
        where: { id: target.id },
        data: { lessonPlanId: m.lessonPlanId },
      });
      carriedForward++;
    }
    // Blocks that just took missed work are no longer free.
    const filled = new Set<string>();
    for (const [, q] of takenBySubject) for (const s of q) filled.add(s.id);
    const openSlots = slots.filter((s) => filled.has(s.id));
    // Generation only touches what is still empty.
    upcomingSlotIds = openSlots.map((s) => s.id);

    // Group upcoming blocks by subject, in day/time order — that order IS the ramp.
    const bySubject = new Map<string, typeof slots>();
    for (const s of openSlots) {
      const subj = slotSubject(s);
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

    // Which grade-level strands are still weak or untouched — the gaps this
    // week should actually close, in whichever standards framework they follow.
    const { grade: coverageGrade, coverage, standards } = await gatherCoverage(childId);
    const gaps = gapSummary(coverage);
    const gapBySubject = new Map(gaps.map((g) => [g.subject, g]));

    // A recently imported practice/assessment report (IXL/MAP) is the
    // freshest, most concrete "where the child is" signal — prioritise its weak
    // skills as the focus. (Option B: the AI reasons from the report; no map.)
    const imported = await prisma.assessmentImport.findFirst({
      where: { childId },
      orderBy: { createdAt: "desc" },
    });
    let importedFocus: { lane?: string; subject?: string; skill?: string; questionsMissed?: number }[] = [];
    try {
      if (imported) importedFocus = JSON.parse(imported.focus);
    } catch {
      importedFocus = [];
    }

    // The REAL standards the index has skills for, per subject, across the
    // child's grade band — the menu the planner MUST choose its focus from, so
    // every pick resolves to an actual IXL deep link.
    const framework = getStandards(child.standardsCode).code;
    // Where they're working now vs the grade they're enrolled in. Plan across the
    // whole span so on-grade standards are always reachable — the goal is to
    // close the gap, not to park the child at their current level.
    const workingGrade = coverageGrade || child.gradeLevel || "3";
    const targetGrade = child.gradeLevel || workingGrade;
    const behindBy = GRADE_ORDER.indexOf(targetGrade) - GRADE_ORDER.indexOf(workingGrade);
    const band = gradeSpan(workingGrade, targetGrade);

    const subjectsForPrompt = await Promise.all(
      Array.from(bySubject.entries()).map(async ([subject, ss]) => {
        const g = gapBySubject.get(subject);
        const menu = await availableStandards({
          subject: subjectKey(subject),
          grades: band,
          framework,
        });
        return {
          subject,
          blocks: ss.length,
          testScore: testScores[subject] ?? null,
          recentScores: (mastery[subject] ?? []).slice(0, 5),
          needsWork: g?.needsWork ?? [],
          notStarted: g?.notStarted ?? [],
          secure: g?.secure ?? [],
          // Pick standardCode from EXACTLY one of these — they are the only ones
          // with a real practice link for this child.
          availableStandards: menu.map((m) => `${m.standardCode} (g${m.gradeLevel}: ${m.skillName})`),
        };
      })
    );

    const p = child.profile;
    const result = await tutorJson<{ subjects: SubjectPlan[] }>(
      `You design a week of ${standards.label}-aligned lessons for a neurodiverse learner. For each subject, pick a focus and build a lesson for each of its blocks so the difficulty rises across the week (start where the child is; each lesson a small step harder). Plain, encouraging language.`,
      `Child: ${child.name}, age ${child.age ?? "?"}. ENROLLED GRADE (the target): ${targetGrade}. Currently working at grade ${workingGrade}. ` +
        (behindBy > 0
          ? `They are ${behindBy} grade level${behindBy === 1 ? "" : "s"} BELOW their enrolled grade. GOAL: close that gap as fast as they can sustain. Choose the HIGHEST standard the child can realistically succeed at right now, not the safest one — and step up a grade as soon as the evidence supports it (recent scores at/above 90%, or a strand already secure). Never park them below grade level out of caution; but never skip a prerequisite they genuinely lack, because a failed lesson costs more time than it saves. `
          : `They are at or above their enrolled grade — keep them moving forward on grade-level (or higher) standards. `) +
        `Reading level: ${p?.readingLevel ?? "grade-3"}, math level: ${p?.mathLevel || "unknown"}. Interests: ${p?.interests || "unknown"}. ` +
        (test ? `They took a check-in test — testScore per subject (% correct) is a strong signal: low = reteach fundamentals, high = push ahead. ` : "") +
        (importedFocus.length
          ? `IMPORTED PRACTICE REPORT (${imported?.provider ?? "external"}, most recent — the STRONGEST signal of where the child is right now): they struggled most with these skills, worst first — make them the focus this week: ${JSON.stringify(importedFocus)}. `
          : "") +
        `This week's subject blocks: ${JSON.stringify(subjectsForPrompt)}. ` +
        `CHOOSING THE FOCUS IS THE MOST IMPORTANT DECISION. For each subject, "needsWork" lists ${standards.label} strands the child scored below 50% on, "notStarted" lists grade-level strands with no work yet, and "secure" lists strands already at 80%+. ` +
        `Pick the week's focus to CLOSE A REAL GAP: prefer a "needsWork" strand first, then a "notStarted" one. Do NOT pick a "secure" strand unless nothing else remains. ` +
        `CRITICAL: set "standardCode" to EXACTLY one of the codes listed in that subject's "availableStandards" (copy the code before the parenthesis, e.g. "3.OA.A.2") — these are the ONLY standards we have real practice links for. The list spans grades ${band.join(", ")} — pick the HIGHEST grade in it the child can succeed at now, moving them toward grade ${targetGrade}; only drop lower when the data shows a real prerequisite gap. Never invent a code or add a framework prefix. If a subject's "availableStandards" is empty, set standardCode to "". ` +
        `Set "topic" to the skill/strand name that matches the standard you chose. ` +
        `Return a "lessons" array with exactly one lesson per block, in order, difficulty rising. ` +
        `Each lesson: {"title","topic" (the strand),"level" (1..N rising),"rationale" (one SHORT sentence saying which gap it closes)}. Keep rationales short so the JSON stays compact. ` +
        `JSON: {"subjects": [{"subject","focus","standardCode","lessons":[...]}]}`,
      5000,
      "plan"
    );

    if (!result?.subjects) {
      return NextResponse.json({ error: "Couldn't generate the week. Try again." }, { status: 502 });
    }

    // Keep the week's plan and its PAST lessons; only replace the UPCOMING ones,
    // clearing their unscheduled preview drafts so nothing is orphaned. History
    // is never overwritten.
    let plan = await prisma.weeklyPlan.findFirst({ where: { childId, weekStart } });
    if (plan) {
      const oldUpcoming = await prisma.weeklyLesson.findMany({
        where: { planId: plan.id, slotId: { in: upcomingSlotIds } },
        select: { lessonPlanId: true },
      });
      const draftIds = oldUpcoming.map((l) => l.lessonPlanId).filter((x): x is string => Boolean(x));
      if (draftIds.length) {
        const scheduled = await prisma.scheduleSlot.findMany({
          where: { lessonPlanId: { in: draftIds } },
          select: { lessonPlanId: true },
        });
        const keep = new Set(scheduled.map((s) => s.lessonPlanId));
        await prisma.lessonPlan.deleteMany({
          where: { id: { in: draftIds.filter((id) => !keep.has(id)) }, published: false },
        });
      }
      await prisma.weeklyLesson.deleteMany({ where: { planId: plan.id, slotId: { in: upcomingSlotIds } } });
      await prisma.weeklyPlan.update({ where: { id: plan.id }, data: { status: "proposed" } });
    } else {
      plan = await prisma.weeklyPlan.create({ data: { childId, weekStart } });
    }
    const planId = plan.id;

    // Map each subject's generated lessons onto its ordered UPCOMING blocks.
    const rows = result.subjects.flatMap((sp) => {
      const blocks = bySubject.get(sp.subject) ?? [];
      return (sp.lessons ?? []).slice(0, blocks.length).map((l, i) => ({
        planId,
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

    // Skip skills already mastered AND skills already scheduled on this week's
    // kept (past) lessons, so the upcoming ramp advances instead of repeating.
    const doneUrls = await masteredSkillUrls(childId);
    const keptSlots = await prisma.scheduleSlot.findMany({
      where: { childId, date: { in: dates }, kind: "lesson", id: { notIn: upcomingSlotIds }, lessonPlanId: { not: null } },
      include: { lessonPlan: { select: { workUrl: true } } },
    });
    for (const s of keptSlots) if (s.lessonPlan?.workUrl) doneUrls.add(s.lessonPlan.workUrl);

    // Materialize each upcoming outline into a previewable DRAFT (index lookup
    // only — fast). Nothing is scheduled onto the child's day until approve.
    const created = await prisma.weeklyLesson.findMany({ where: { planId, slotId: { in: upcomingSlotIds } } });
    let built = 0;
    for (const wl of created) {
      await materializeWeeklyLesson(wl, child, { publish: false, schedule: false, doneUrls });
      built++;
    }

    return NextResponse.json({
      ok: true,
      planId,
      count: rows.length,
      drafts: built,
      carriedForward,
      kept: carried.length,
      note: [
        carriedForward ? `${carriedForward} unfinished lesson${carriedForward === 1 ? "" : "s"} moved forward` : "",
        carried.length ? `${carried.length} already had a lesson and were left alone` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (op === "approve") {
    // Publish + schedule every draft in the plan (preserving guide edits). If a
    // draft is somehow missing, build it live as a fallback.
    const wp = await prisma.weeklyPlan.findUnique({
      where: { id: body.planId },
      include: { child: true, lessons: true },
    });
    if (!wp) return NextResponse.json({ error: "plan not found" }, { status: 404 });
    const doneUrls = await masteredSkillUrls(wp.child.id);
    for (const wl of wp.lessons) {
      await materializeWeeklyLesson(wl, wp.child, { publish: true, schedule: true, doneUrls });
    }
    await prisma.weeklyPlan.update({ where: { id: body.planId }, data: { status: "approved" } });
    return NextResponse.json({ ok: true, scheduled: wp.lessons.length });
  }

  // Approve ONE lesson: publish it and put it on its block.
  if (op === "approveOne") {
    const wl = await prisma.weeklyLesson.findUnique({
      where: { id: body.weeklyLessonId },
      include: { plan: { include: { child: true } } },
    });
    if (!wl) return NextResponse.json({ error: "not found" }, { status: 404 });
    const doneUrls = await masteredSkillUrls(wl.plan.childId);
    await materializeWeeklyLesson(wl, wl.plan.child, { publish: true, schedule: true, doneUrls });
    return NextResponse.json({ ok: true });
  }

  // Take ONE lesson back off the schedule so the guide can edit it (or reuse the
  // same skill again). The lesson itself stays in the library as a draft.
  // History is protected: a past day, or a session the child already finished,
  // can't be unapproved.
  if (op === "unapprove") {
    const wl = await prisma.weeklyLesson.findUnique({ where: { id: body.weeklyLessonId } });
    if (!wl) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (wl.date < todayStr()) {
      return NextResponse.json({ error: "That day has passed — past lessons stay as they are." }, { status: 400 });
    }
    const slot = await prisma.scheduleSlot.findUnique({
      where: { id: wl.slotId },
      include: { sessions: { select: { state: true } } },
    });
    if (slot?.sessions.some((s) => s.state === "closed")) {
      return NextResponse.json({ error: "That lesson is already done — it can't be unapproved." }, { status: 400 });
    }
    // Off the schedule, back to an editable draft.
    if (slot) await prisma.scheduleSlot.update({ where: { id: slot.id }, data: { lessonPlanId: null } });
    if (wl.lessonPlanId) {
      await prisma.lessonPlan.update({ where: { id: wl.lessonPlanId }, data: { published: false } });
    }
    await prisma.weeklyLesson.update({ where: { id: wl.id }, data: { status: "draft" } });
    await prisma.weeklyPlan.update({ where: { id: wl.planId }, data: { status: "proposed" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
