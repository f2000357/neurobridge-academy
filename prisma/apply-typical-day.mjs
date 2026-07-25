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
// It clears the whole day, so rebuild it for every active learner.
const children = await prisma.child.findMany({ where: { archived: false } });
const withSessions = await prisma.scheduleSlot.count({
  where: { date, sessions: { some: {} } },
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

// The day runs in 30-minute blocks: a lesson takes ~25 minutes, leaving room to
// breathe (or take a break) if they finish early. Flexible blocks carry an
// elective; a related service (speech, OT…) fits the same 30 minutes.
const B = 30;
const at = (h, m = 0) => h * 60 + m;
const block = (childId, startMin, extra) => ({ childId, date, startMin, endMin: startMin + B, ...extra });

const typicalDay = (childId) => [
  block(childId, at(9), { kind: "lesson", lessonPlanId: math.id }),
  block(childId, at(9, 30), { kind: "lesson", lessonPlanId: reading.id }),
  block(childId, at(10), { kind: "break" }),
  block(childId, at(10, 30), { kind: "lesson", lessonPlanId: writing.id }),
  block(childId, at(11), { kind: "lesson", lessonPlanId: science.id }),
  block(childId, at(11, 30), { kind: "flexible", activity: "outdoor" }),
  block(childId, at(12), { kind: "break" }),
  block(childId, at(12, 30), { kind: "service", activity: "speech" }),
  block(childId, at(13), { kind: "flexible", activity: "scratch" }),
  // Two back-to-back flexible blocks make room for a library trip.
  block(childId, at(13, 30), { kind: "flexible", activity: "library" }),
  block(childId, at(14), { kind: "flexible", activity: "library" }),
];

await prisma.scheduleSlot.createMany({
  data: children.flatMap((c) => typicalDay(c.id)),
});

console.log(`Applied the typical day for ${children.map((c) => c.name).join(" & ")}.`);
await prisma.$disconnect();
