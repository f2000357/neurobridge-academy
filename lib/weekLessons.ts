import { prisma } from "./prisma";
import { providerName } from "./providers";
import { getStandards } from "./standards";
import { subjectKey } from "./subjects";
import {
  childProviders,
  contentForStandard,
  contentForSkillName,
  preferredOrder,
  providerBrowseUrl,
} from "./contentIndex";

export type WLRow = {
  id: string;
  slotId: string;
  subject: string;
  topic: string;
  standardCode: string;
  title: string;
  order: number; // block's position in the subject's week — picks a distinct skill
  lessonPlanId: string | null;
};
export type ChildRow = {
  id: string;
  teacherId: string;
  standardsCode: string | null;
  providers: string;
};

// Build the real, index-driven lesson for one weekly-lesson outline. No AI-
// authored content: the AI chose the standard, the index supplies the exact
// IXL skill for the child's providers (deterministic order).
//   publish:false, schedule:false = a preview DRAFT the guide can review/edit
//     before approving (created at generate time).
//   publish:true, schedule:true   = live on the child's day (at approve time).
// If the weekly lesson already has a draft attached, we PUBLISH that existing
// plan rather than rebuild it — so the guide's edits survive approval.
export async function materializeWeeklyLesson(
  wl: WLRow,
  child: ChildRow,
  opts: { publish: boolean; schedule: boolean; doneUrls?: Set<string>; used?: Set<string> }
) {
  const doneUrls = opts.doneUrls ?? new Set<string>();
  // Skills already handed out in THIS generation. Without it a standard with
  // one skill left gave every block of the week the same lesson.
  const used = opts.used ?? new Set<string>();
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
    // Skip skills the child has already MASTERED, and anything this generation
    // has already used, so a week ramps through DIFFERENT skills.
    let pool = providerLinks.filter((l) => !doneUrls.has(l.practiceUrl) && !used.has(l.practiceUrl));

    // A standard can simply run out. 3.OA.B.6 indexes three skills; once two are
    // mastered there is one left, and `order % 1` handed it to every block of
    // the week. When that happens, widen to the rest of the subject at the same
    // grade rather than repeating a lesson he has already sat.
    if (pool.length === 0) {
      const gradeHint = providerLinks[0]?.gradeLevel || "";
      // Stay in the same DOMAIN first — "3.OA.B.6" widens to other 3.OA skills,
      // not to geometry. Widening on subject alone put "Draw squares,
      // rectangles, rhombuses" into a division week, still tagged 3.OA.B.6.
      const domain = wl.standardCode.split(".").slice(0, 2).join(".");
      const base = {
        framework,
        provider,
        subject: subjKey,
        active: true,
        ...(gradeHint ? { gradeLevel: gradeHint } : {}),
        practiceUrl: { notIn: [...doneUrls, ...used].filter(Boolean) },
      };
      let wider = domain
        ? await prisma.contentItem.findMany({
            where: { ...base, standardCode: { startsWith: `${domain}.` } },
            orderBy: [{ skillCode: "asc" }, { practiceUrl: "asc" }],
            take: 60,
          })
        : [];
      // Only leave the domain when it has nothing left to give.
      if (wider.length === 0) {
        wider = await prisma.contentItem.findMany({
          where: base,
          orderBy: [{ skillCode: "asc" }, { practiceUrl: "asc" }],
          take: 60,
        });
      }
      pool = wider.map((w) => ({
        provider: w.provider,
        skillName: w.skillName,
        practiceUrl: w.practiceUrl,
        videoUrl: w.videoUrl,
        gradeLevel: w.gradeLevel,
        standardCode: w.standardCode,
        subject: w.subject,
      }));
    }
    // Last resorts, in order: anything unused, then anything at all.
    if (pool.length === 0) pool = providerLinks.filter((l) => !used.has(l.practiceUrl));
    if (pool.length === 0) pool = providerLinks;
    const best = pool.length ? pool[wl.order % pool.length] : undefined;
    if (best?.practiceUrl) used.add(best.practiceUrl);

    // Nothing indexed for this standard on the child's platform? Fall back to a
    // canonical skill name so the lesson still reads sensibly.
    let skillHint = "";
    if (!best && wl.standardCode) {
      const anyLinks = await contentForStandard({ standardCode: wl.standardCode, providers: ["ixl"], framework });
      if (anyLinks.length) skillHint = anyLinks[wl.order % anyLinks.length].skillName;
    }

    const grade = best?.gradeLevel || "";
    // If widening moved us to another standard, say so — a block claiming a
    // code it does not teach is worse than one with no code at all.
    const realStandard = best?.standardCode || wl.standardCode;
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
        standardCode: realStandard,
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
      data: { title: lessonTitle, topic: skillName, standardCode: realStandard },
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
