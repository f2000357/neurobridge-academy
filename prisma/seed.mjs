// Seed: one teacher, two children with profiles, one lesson plan,
// and a schedule for today so the student view has something to show.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const fractionChunks = [
  {
    type: "read_text",
    title: "What is a fraction?",
    content:
      "A fraction is a way to talk about parts of something. If a pizza is cut into 4 equal slices, one slice is 1/4 of the pizza. The bottom number tells how many equal parts there are. The top number tells how many parts we have.",
    read_aloud: true,
  },
  {
    type: "visual",
    title: "Fraction bars",
    content:
      "Look at two bars of the same size. The first bar is split into 4 parts with 1 shaded: that is 1/4. The second bar is split into 4 parts with 2 shaded: that is 2/4.",
    visual: "fraction-bars",
  },
  {
    type: "worksheet",
    title: "Try it",
    items: 3,
    difficulty: "adaptive",
    seed_question: "What is 1/4 + 2/4?",
    seed_answer: "3/4",
  },
  { type: "wrap_up", title: "Look what you did" },
];

async function main() {
  const existing = await prisma.user.findFirst();
  if (existing) {
    console.log("Already seeded — skipping.");
    return;
  }

  const center = await prisma.center.create({
    data: { name: "Sunrise Center", region: "NJ" },
  });

  const teacher = await prisma.user.create({
    data: { name: "Gayathri", role: "guide", centerId: center.id },
  });

  const aarav = await prisma.child.create({
    data: {
      teacherId: teacher.id,
      centerId: center.id,
      name: "Aarav",
      profile: {
        create: {
          readingLevel: "grade-3",
          interests: "trains, space, Minecraft",
          groundingStyle: "standard",
          timerStyle: "bar",
        },
      },
    },
  });

  const meera = await prisma.child.create({
    data: {
      teacherId: teacher.id,
      centerId: center.id,
      name: "Meera",
      profile: {
        create: {
          readingLevel: "early-reader",
          sentenceStyle: "short",
          interests: "animals, drawing",
          groundingStyle: "extended",
          timerStyle: "sand",
          pacing: "gentle",
        },
      },
    },
  });

  const fractions = await prisma.lessonPlan.create({
    data: {
      teacherId: teacher.id,
      title: "Adding fractions with the same denominator",
      subject: "Math",
      goal: "Add two fractions like 1/4 + 2/4",
      whyItMatters: "So you can figure out parts of things, like pizza slices.",
      chunks: JSON.stringify(fractionChunks),
      durationMin: 25,
      published: true,
    },
  });

  // Placeholder plans for the other periods of the typical day.
  const stubChunks = (topic) =>
    JSON.stringify([
      { type: "read_text", title: topic, content: `Today's ${topic} lesson.`, read_aloud: true },
      { type: "worksheet", title: "Try it", items: 2, difficulty: "adaptive" },
      { type: "wrap_up", title: "Look what you did" },
    ]);

  const mkPlan = (title, subject) =>
    prisma.lessonPlan.create({
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

  const reading = await mkPlan("Reading: story of the week", "ELA — Reading");
  const writing = await mkPlan("Writing: my weekend sentences", "ELA — Writing");
  const science = await mkPlan("Science: what plants need", "Science / Social");

  // The typical day: four 45-min periods + two flexible periods, buffers between.
  const date = todayStr();
  const typicalDay = (childId) => [
    { childId, lessonPlanId: fractions.id, kind: "lesson", date, startMin: 9 * 60, endMin: 9 * 60 + 45 },
    { childId, lessonPlanId: reading.id, kind: "lesson", date, startMin: 10 * 60, endMin: 10 * 60 + 45 },
    { childId, kind: "flexible", date, startMin: 11 * 60, endMin: 11 * 60 + 45 },
    { childId, kind: "break", date, startMin: 12 * 60, endMin: 13 * 60 },
    { childId, lessonPlanId: writing.id, kind: "lesson", date, startMin: 13 * 60, endMin: 13 * 60 + 45 },
    { childId, lessonPlanId: science.id, kind: "lesson", date, startMin: 14 * 60, endMin: 14 * 60 + 45 },
    { childId, kind: "flexible", date, startMin: 15 * 60, endMin: 15 * 60 + 45 },
  ];

  await prisma.scheduleSlot.createMany({
    data: [...typicalDay(aarav.id), ...typicalDay(meera.id)],
  });

  console.log("Seeded: teacher Gayathri, Aarav & Meera, four subject plans, the typical day.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
