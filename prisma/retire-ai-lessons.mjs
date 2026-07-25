// Retire legacy AI-authored lessons. The new model builds index-driven provider
// lessons (a "practice" chunk that deep-links to IXL). Any LessonPlan with
// no practice chunk is old generated content and gets cleaned out — references
// are detached first so deletes don't hit foreign keys.
//
//   node prisma/retire-ai-lessons.mjs

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const plans = await prisma.lessonPlan.findMany({ select: { id: true, chunks: true } });
const legacyIds = plans
  .filter((p) => {
    try {
      const c = JSON.parse(p.chunks);
      return !Array.isArray(c) || !c.some((x) => x?.type === "practice");
    } catch {
      return true;
    }
  })
  .map((p) => p.id);

if (legacyIds.length === 0) {
  console.log("No legacy AI-content lessons to retire.");
  process.exit(0);
}

// Detach references, then delete.
await prisma.scheduleSlot.updateMany({ where: { lessonPlanId: { in: legacyIds } }, data: { lessonPlanId: null } });
await prisma.weeklyLesson.updateMany({ where: { lessonPlanId: { in: legacyIds } }, data: { lessonPlanId: null } });
await prisma.proposedLesson.updateMany({ where: { lessonPlanId: { in: legacyIds } }, data: { lessonPlanId: null } });
const res = await prisma.lessonPlan.deleteMany({ where: { id: { in: legacyIds } } });

const kept = plans.length - legacyIds.length;
console.log(`Retired ${res.count} legacy AI-content lessons. Kept ${kept} provider (index-driven) lesson${kept === 1 ? "" : "s"}.`);
await prisma.$disconnect();
