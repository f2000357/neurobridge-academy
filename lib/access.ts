import { prisma } from "./prisma";

// Who may do what to a child.
//
// Authorization reads `ChildAccess`, not `Child.teacherId`. Several adults can
// manage one learner — a parent plus a hired guide, say — and they are equals for
// day-to-day work. The only asymmetry is that exactly one of them is the
// **primary guide**: they decide who else has access, and they cannot walk away
// without handing the role to someone else, so a child is never left unattended.
//
// Specialists (ABA, OT, chess…) are deliberately NOT part of this. They sign in
// with a code, their authority stops at the activity they govern, and they never
// get guide access. See lib/teacherAuth.ts.

export type AccessRole = "primary_guide" | "guide";

/** What a caller is allowed to do. Coarse on purpose — guides are trusted adults. */
export type Capability =
  | "view" // see the child, their schedule, lessons, notes, IEP
  | "manage" // edit schedule, lessons, points, profile, documents
  | "manage_access" // invite/remove other people, transfer primary
  | "delete_child"; // archive or delete the learner

const GUIDE_CAPS: Capability[] = ["view", "manage"];
const PRIMARY_CAPS: Capability[] = ["view", "manage", "manage_access", "delete_child"];

export function capsForRole(role: string): Capability[] {
  return role === "primary_guide" ? PRIMARY_CAPS : GUIDE_CAPS;
}

/** An access grant that has not lapsed. Substitutes carry an expiry. */
function live(row: { expiresAt: Date | null }): boolean {
  return !row.expiresAt || row.expiresAt.getTime() > Date.now();
}

/**
 * The caller's role on this child, or null. Center admins and NeuroBridge admins
 * are handled by the caller (they are not `ChildAccess` rows) — see lib/authz.
 */
export async function roleOnChild(userId: string, childId: string): Promise<AccessRole | null> {
  const row = await prisma.childAccess.findUnique({
    where: { childId_userId: { childId, userId } },
    select: { role: true, expiresAt: true },
  });
  if (!row || !live(row)) return null;
  return row.role === "primary_guide" ? "primary_guide" : "guide";
}

/** Everyone who may manage this child right now, primary first. */
export async function peopleForChild(childId: string) {
  const rows = await prisma.childAccess.findMany({
    where: { childId },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return rows
    .filter((r) => live(r) || r.expiresAt) // keep lapsed rows visible so they can be cleaned up
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.name,
      email: r.user.email ?? "",
      accountRole: r.user.role,
      role: r.role as AccessRole,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      lapsed: !live(r),
      createdAt: r.createdAt.toISOString(),
    }));
}

/** Every child this user may manage (their own roster, not the whole centre). */
export async function childrenForUser(userId: string) {
  const rows = await prisma.childAccess.findMany({
    where: { userId },
    include: { child: { select: { id: true, name: true, username: true, archived: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .filter((r) => live(r) && !r.child.archived)
    .map((r) => ({
      childId: r.childId,
      name: r.child.name,
      username: r.child.username,
      role: r.role as AccessRole,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    }));
}

/**
 * The learners an operator works with — the roster every console page should use.
 * A guide's roster is everything they have access to (not just what they are
 * primary for), which is the whole point of several guides per child.
 */
export async function rosterChildIds(user: {
  id: string;
  role: string;
  centerId: string | null;
}): Promise<string[]> {
  if (user.role === "neurable_admin") {
    const all = await prisma.child.findMany({ where: { archived: false }, select: { id: true } });
    return all.map((c) => c.id);
  }
  if (user.role === "center_admin") {
    const mine = await prisma.child.findMany({
      where: { archived: false, centerId: user.centerId ?? "__none__" },
      select: { id: true },
    });
    return mine.map((c) => c.id);
  }
  const rows = await prisma.childAccess.findMany({
    where: { userId: user.id },
    select: { childId: true, expiresAt: true },
  });
  return rows.filter(live).map((r) => r.childId);
}

/**
 * The roster as console pages want it: the learner records this operator works
 * with, name-ordered, profile included. Use this instead of `user.children`,
 * which only knows about learners you are PRIMARY guide for.
 */
export async function rosterChildren(user: { id: string; role: string; centerId: string | null }) {
  const ids = await rosterChildIds(user);
  if (ids.length === 0) return [];
  return prisma.child.findMany({
    where: { id: { in: ids }, archived: false },
    include: { profile: true },
    orderBy: { name: "asc" },
  });
}

/** How many live guides a child has — the guard against orphaning them. */
export async function liveGuideCount(childId: string): Promise<number> {
  const rows = await prisma.childAccess.findMany({
    where: { childId },
    select: { expiresAt: true },
  });
  return rows.filter(live).length;
}

/**
 * Grant access. Idempotent: re-inviting someone who already has access updates
 * their role/expiry rather than failing.
 */
export async function grantAccess(opts: {
  childId: string;
  userId: string;
  role?: AccessRole;
  expiresAt?: Date | null;
  invitedById?: string | null;
}) {
  const role = opts.role ?? "guide";
  return prisma.childAccess.upsert({
    where: { childId_userId: { childId: opts.childId, userId: opts.userId } },
    update: { role, expiresAt: opts.expiresAt ?? null },
    create: {
      childId: opts.childId,
      userId: opts.userId,
      role,
      expiresAt: opts.expiresAt ?? null,
      invitedById: opts.invitedById ?? null,
    },
  });
}

/**
 * Remove someone's access, with the rules that keep a child attended:
 *  - the primary guide must hand the role over first;
 *  - the last remaining guide cannot be removed.
 * Returns the blocks they held that now need cover, so the caller can say so.
 */
export async function revokeAccess(opts: {
  childId: string;
  userId: string;
}): Promise<{ ok: true; freedBlocks: number } | { ok: false; reason: string }> {
  const row = await prisma.childAccess.findUnique({
    where: { childId_userId: { childId: opts.childId, userId: opts.userId } },
  });
  if (!row) return { ok: false, reason: "That person doesn't have access to this learner." };

  if (row.role === "primary_guide") {
    return {
      ok: false,
      reason:
        "They are the primary guide. Hand that role to someone else first — a learner can't be left without one.",
    };
  }
  if ((await liveGuideCount(opts.childId)) <= 1) {
    return { ok: false, reason: "This is the learner's last guide — someone has to stay." };
  }

  await prisma.childAccess.delete({ where: { id: row.id } });
  return { ok: true, freedBlocks: 0 };
}

/**
 * Hand the primary role to another guide. The outgoing primary stays on as a
 * regular guide, so nothing is lost by transferring.
 */
export async function transferPrimary(opts: {
  childId: string;
  fromUserId: string;
  toUserId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [from, to] = await Promise.all([
    prisma.childAccess.findUnique({
      where: { childId_userId: { childId: opts.childId, userId: opts.fromUserId } },
    }),
    prisma.childAccess.findUnique({
      where: { childId_userId: { childId: opts.childId, userId: opts.toUserId } },
    }),
  ]);
  if (!from || from.role !== "primary_guide") return { ok: false, reason: "You aren't the primary guide." };
  if (!to) return { ok: false, reason: "That person needs access to this learner first." };
  if (!live(to)) return { ok: false, reason: "That person's access has lapsed." };

  await prisma.$transaction([
    prisma.childAccess.update({ where: { id: from.id }, data: { role: "guide" } }),
    prisma.childAccess.update({ where: { id: to.id }, data: { role: "primary_guide", expiresAt: null } }),
    // Keep the denormalised pointer honest.
    prisma.child.update({ where: { id: opts.childId }, data: { teacherId: opts.toUserId } }),
  ]);
  return { ok: true };
}
