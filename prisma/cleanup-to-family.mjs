// Reduce the database to the real starting cast:
//   • NeuroBridge admin  — gayathri.c.sekar@gmail.com
//   • Parent / guide     — Gayathri Aiyer (gayathri@dev.neurobridge)
//   • Child              — Prithvi Aiyer, with his documents and history intact
//
// Everything else — seed centres, demo guides, demo children — goes. The content
// index (4,101 IXL skills) is deliberately kept: it is reference data, not
// anyone's personal record.
//
//   DRY=1 node prisma/cleanup-to-family.mjs   # report only
//   node prisma/cleanup-to-family.mjs         # do it

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const DRY = process.env.DRY === "1";

const ADMIN_EMAIL = "gayathri.c.sekar@gmail.com";
const PARENT_EMAIL = "gayathri@dev.neurobridge";
const PARENT_NAME = "Gayathri Aiyer";
const KEEP_CHILD = "Prithvi Aiyer";

const say = (s) => console.log(s);

// ── who and what survives ────────────────────────────────────────────────────
const child = await prisma.child.findFirst({ where: { name: KEEP_CHILD } });
if (!child) throw new Error(`Child "${KEEP_CHILD}" not found — aborting.`);

// The parent: reuse the existing Gayathri account, renamed.
let parent = await prisma.user.findUnique({ where: { email: PARENT_EMAIL } });
if (!parent) throw new Error(`No account for ${PARENT_EMAIL} — aborting.`);

// The admin: reuse the seeded NeuroBridge HQ account, re-addressed.
let admin = await prisma.user.findFirst({ where: { role: "neurable_admin" } });
if (!admin) throw new Error("No NeuroBridge admin found — aborting.");
if (admin.id === parent.id) throw new Error("Admin and parent must be different accounts — aborting.");

say(`Keeping:`);
say(`  admin   ${ADMIN_EMAIL}  (was ${admin.email})`);
say(`  parent  ${PARENT_EMAIL} → "${PARENT_NAME}"`);
say(`  child   ${child.name}`);

const doomedUsers = await prisma.user.findMany({
  where: { id: { notIn: [admin.id, parent.id] } },
  select: { id: true, name: true, email: true },
});
const doomedKids = await prisma.child.findMany({
  where: { id: { not: child.id } },
  select: { id: true, name: true },
});
say(`\nRemoving:`);
say(`  users    ${doomedUsers.map((u) => u.name).join(", ") || "none"}`);
say(`  children ${doomedKids.map((k) => k.name).join(", ") || "none"}`);
say(`  centres  all`);

if (DRY) {
  say("\n(dry run — nothing changed)");
  await prisma.$disconnect();
  process.exit(0);
}

// ── 1. Prithvi belongs to the parent ─────────────────────────────────────────
await prisma.child.update({
  where: { id: child.id },
  data: { teacherId: parent.id, centerId: null },
});
await prisma.childAccess.deleteMany({ where: { childId: child.id } });
await prisma.childAccess.create({
  data: { childId: child.id, userId: parent.id, role: "primary_guide" },
});

// ── 2. Identities ────────────────────────────────────────────────────────────
await prisma.user.update({
  where: { id: parent.id },
  data: { name: PARENT_NAME, centerId: null, role: "guide" },
});
await prisma.user.update({
  where: { id: admin.id },
  data: { email: ADMIN_EMAIL, name: "NeuroBridge Admin", centerId: null },
});

// The parent holds the (free) subscription.
await prisma.subscription.upsert({
  where: { userId: parent.id },
  update: { plan: "free", amountCents: 0, status: "active" },
  create: { userId: parent.id, plan: "free", amountCents: 0, status: "active" },
});

// ── 3. Remove the demo cast ──────────────────────────────────────────────────
// Children cascade to their own data. Lessons authored by departing users are
// reassigned to the parent when they belong to Prithvi, then the rest go.
const doomedKidIds = doomedKids.map((k) => k.id);
for (const id of doomedKidIds) {
  await prisma.scheduleSlot.deleteMany({ where: { childId: id } });
  await prisma.child.delete({ where: { id } });
}

const doomedUserIds = doomedUsers.map((u) => u.id);
await prisma.lessonPlan.updateMany({
  where: { childId: child.id, teacherId: { in: doomedUserIds } },
  data: { teacherId: parent.id },
});
await prisma.lessonPlan.deleteMany({ where: { teacherId: { in: doomedUserIds } } });
await prisma.reward.deleteMany({ where: { teacherId: { in: doomedUserIds } } });
await prisma.subscription.deleteMany({ where: { userId: { in: doomedUserIds } } });
await prisma.childAccess.deleteMany({ where: { userId: { in: doomedUserIds } } });
await prisma.user.deleteMany({ where: { id: { in: doomedUserIds } } });

// Specialists are the parent's to re-add; clear the demo one.
await prisma.teacherAssignment.deleteMany({});
await prisma.teacherNote.deleteMany({});
await prisma.specialistTeacher.deleteMany({});

// No centres yet — the parent starts on their own.
await prisma.center.deleteMany({});

// Stale invitations from the demo era.
await prisma.guideInvitation.deleteMany({});

// ── 4. Report ────────────────────────────────────────────────────────────────
const users = await prisma.user.findMany({ select: { name: true, email: true, role: true } });
const kids = await prisma.child.findMany({
  select: { name: true, _count: { select: { slots: true, documents: true, iepReviews: true } } },
});
say(`\nDone.`);
say(`  users:    ${users.map((u) => `${u.name} <${u.email}> [${u.role}]`).join("  |  ")}`);
say(`  children: ${kids.map((k) => `${k.name} (slots ${k._count.slots}, docs ${k._count.documents}, IEP reviews ${k._count.iepReviews})`).join(", ")}`);
say(`  centres:  ${await prisma.center.count()}`);
say(`  content index kept: ${await prisma.contentItem.count()} skills`);

await prisma.$disconnect();
