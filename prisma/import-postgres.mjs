import { PrismaClient } from "@prisma/client";
import fs from "fs";
const prisma = new PrismaClient();
const dump = JSON.parse(fs.readFileSync(process.env.DUMP, "utf8"));

// Convert named DateTime fields (ISO strings in the dump) back to Date objects.
const D = (r, fields) => {
  const o = { ...r };
  for (const f of fields) if (o[f] != null) o[f] = new Date(o[f]);
  return o;
};
const many = async (model, rows) => {
  if (!rows || rows.length === 0) return 0;
  await prisma[model].createMany({ data: rows });
  return rows.length;
};

async function main() {
  // 1) One center for the migrated guide.
  const center = await prisma.center.create({ data: { name: "Sunrise Center", region: "NJ" } });

  // 2) The existing teacher becomes a guide in that center (id preserved).
  const t = dump.teacher[0];
  await prisma.user.create({
    data: { id: t.id, name: t.name, pin: t.pin, role: "guide", centerId: center.id },
  });

  // 3) Learners — add centerId; teacherId (their guide) is preserved.
  const kids = await many("child", dump.child.map((c) => ({ ...c, centerId: center.id })));
  const profs = await many("childProfile", dump.childProfile);

  // 4) Content — lessons belong to the center, private by default; convert dates.
  const lessons = await many(
    "lessonPlan",
    dump.lessonPlan.map((l) => D({ ...l, centerId: center.id, visibility: "private" }, ["createdAt", "updatedAt"]))
  );

  // 5) Proposals, schedule, sessions, signals, progress, points, homework, weekly plans, rewards.
  const proposals = await many("programProposal", dump.programProposal.map((r) => D(r, ["createdAt"])));
  const proposed = await many("proposedLesson", dump.proposedLesson);
  const slots = await many("scheduleSlot", dump.scheduleSlot);
  const sessions = await many("session", dump.session.map((r) => D(r, ["startedAt", "endedAt"])));
  const signals = await many("evalSignal", dump.evalSignal.map((r) => D(r, ["createdAt"])));
  const notes = await many("progressNote", dump.progressNote.map((r) => D(r, ["createdAt"])));
  const points = await many("pointEvent", dump.pointEvent.map((r) => D(r, ["createdAt"])));
  const hw = await many("homework", dump.homework.map((r) => D(r, ["createdAt"])));
  const wplans = await many("weeklyPlan", dump.weeklyPlan.map((r) => D(r, ["createdAt"])));
  const wlessons = await many("weeklyLesson", dump.weeklyLesson);
  const rewards = await many("reward", dump.reward.map((r) => D(r, ["createdAt"])));
  const redemptions = await many("redemption", dump.redemption.map((r) => D(r, ["createdAt"])));
  const absences = await many("absence", dump.absence.map((r) => D(r, ["createdAt"])));
  const wtests = await many("weeklyTest", dump.weeklyTest.map((r) => D(r, ["createdAt"])));

  console.log(JSON.stringify({
    center: center.id, guide: t.name, kids, profs, lessons, proposals, proposed,
    slots, sessions, signals, notes, points, hw, wplans, wlessons, rewards, redemptions, absences, wtests,
  }, null, 2));
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
