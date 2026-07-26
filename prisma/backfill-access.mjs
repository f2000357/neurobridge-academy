// Give every existing child a ChildAccess row for their current guide, as
// primary_guide. Idempotent — safe to re-run.
//
//   node prisma/backfill-access.mjs

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const kids = await prisma.child.findMany({
  select: { id: true, name: true, teacherId: true },
});

let made = 0;
let already = 0;
for (const k of kids) {
  const existing = await prisma.childAccess.findUnique({
    where: { childId_userId: { childId: k.id, userId: k.teacherId } },
  });
  if (existing) {
    // Make sure the pointer and the grant agree on who is primary.
    if (existing.role !== "primary_guide") {
      await prisma.childAccess.update({ where: { id: existing.id }, data: { role: "primary_guide" } });
      console.log(`  ${k.name}: promoted existing grant to primary_guide`);
      made++;
    } else {
      already++;
    }
    continue;
  }
  await prisma.childAccess.create({
    data: { childId: k.id, userId: k.teacherId, role: "primary_guide" },
  });
  console.log(`  ${k.name}: primary_guide granted`);
  made++;
}

const total = await prisma.childAccess.count();
console.log(
  `\n${made} grant(s) written, ${already} already correct. ChildAccess now holds ${total} row(s) for ${kids.length} child(ren).`
);
await prisma.$disconnect();
