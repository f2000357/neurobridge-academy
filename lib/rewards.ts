import { prisma } from "./prisma";

// Whose prizes are they?
//
// Reward.teacherId points at a User, so a prize belonged to the adult who typed
// it in. That is wrong for what a prize actually is: the family's offer to the
// child. A second guide saw an empty shelf, and the child's own shelf would
// have changed depending on which adult happened to own the record.
//
// So the shelf is the union of every guide on that child. Whoever adds a prize,
// everyone working with the child can see and award it.

/** Every user who may act for this child: their guides, plus the owner. */
export async function guideIdsForChild(childId: string): Promise<string[]> {
  const [access, child] = await Promise.all([
    prisma.childAccess.findMany({ where: { childId }, select: { userId: true } }),
    prisma.child.findUnique({ where: { id: childId }, select: { teacherId: true } }),
  ]);
  const ids = new Set(access.map((a) => a.userId));
  if (child?.teacherId) ids.add(child.teacherId);
  return [...ids];
}

/** The same, across a roster — for a guide's own prize list. */
export async function guideIdsForChildren(childIds: string[]): Promise<string[]> {
  if (childIds.length === 0) return [];
  const [access, children] = await Promise.all([
    prisma.childAccess.findMany({ where: { childId: { in: childIds } }, select: { userId: true } }),
    prisma.child.findMany({ where: { id: { in: childIds } }, select: { teacherId: true } }),
  ]);
  return [...new Set([...access.map((a) => a.userId), ...children.map((c) => c.teacherId)])];
}
