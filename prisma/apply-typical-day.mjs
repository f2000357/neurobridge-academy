// One-off dev helper: replace today's demo slots with the typical-day template
// and create the missing subject plans. Safe on seeded demo data only — it
// refuses to touch any slot that already has a session.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const date = todayStr();
const teacher = await prisma.user.findFirst({ include: { children: true } });
const withSessions = await prisma.scheduleSlot.count({
  where: { date, session: { isNot: null } },
});
if (withSessions > 0) {
  console.error("Today has slots with real sessions — not touching them.");
  process.exit(1);
}

const stubChunks = (topic) =>
  JSON.stringify([
    { type: "read_text", title: topic, content: `Today's ${topic} lesson.`, read_aloud: true },
    { type: "worksheet", title: "Try it", items: 2, difficulty: "adaptive" },
    { type: "wrap_up", title: "Look what you did" },
  ]);

async function ensurePlan(title, subject) {
  const found = await prisma.lessonPlan.findFirst({ where: { title } });
  if (found) return found;
  return prisma.lessonPlan.create({
    data: {
      teacherId: teacher.id,
      title,
      subject,
      goal: title,
      chunks: stubChunks(title),
      durationMin: 45,
      published: true,
    },
  });
}

const math = await prisma.lessonPlan.findFirst({ where: { subject: "Math" } });
const reading = await ensurePlan("Reading: story of the week", "ELA — Reading");
const writing = await ensurePlan("Writing: my weekend sentences", "ELA — Writing");
const science = await ensurePlan("Science: what plants need", "Science / Social");

await prisma.scheduleSlot.deleteMany({ where: { date } });

const typicalDay = (childId) => [
  { childId, lessonPlanId: math.id, kind: "lesson", date, startMin: 9 * 60, endMin: 9 * 60 + 45 },
  { childId, lessonPlanId: reading.id, kind: "lesson", date, startMin: 10 * 60, endMin: 10 * 60 + 45 },
  { childId, kind: "flexible", date, startMin: 11 * 60, endMin: 11 * 60 + 45 },
  { childId, kind: "break", date, startMin: 12 * 60, endMin: 13 * 60 },
  { childId, lessonPlanId: writing.id, kind: "lesson", date, startMin: 13 * 60, endMin: 13 * 60 + 45 },
  { childId, lessonPlanId: science.id, kind: "lesson", date, startMin: 14 * 60, endMin: 14 * 60 + 45 },
  { childId, kind: "flexible", date, startMin: 15 * 60, endMin: 15 * 60 + 45 },
];

await prisma.scheduleSlot.createMany({
  data: teacher.children.flatMap((c) => typicalDay(c.id)),
});

console.log(`Applied the typical day for ${teacher.children.map((c) => c.name).join(" & ")}.`);
await prisma.$disconnect();
