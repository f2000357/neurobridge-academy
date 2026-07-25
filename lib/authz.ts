import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { getCurrentUser } from "./auth";

// The authorization boundary.
//
// Every learner's data is keyed to childId, so the one question that gates a
// request is: "may this caller act on THIS child?". Identity itself is still
// dev-grade (see lib/auth — a cookie holding a user id, no secret); real login
// lands separately. This layer enforces tenancy relative to whoever the caller
// is currently resolved as, which is what stops one family's data leaking to
// another. Once real login removes cookie forgery, the same checks hold with a
// trustworthy identity underneath.

export type Operator = { id: string; role: string; centerId: string | null };

/** The current operator (guide / center admin / NeuroBridge admin), or null. */
export async function currentOperator(): Promise<Operator | null> {
  const u = await getCurrentUser({ select: { id: true, role: true, centerId: true } });
  return u ?? null;
}

/**
 * May the current operator manage this child? True for the child's own guide,
 * their center's admin, or NeuroBridge admin. This gates anything that edits the
 * child, their schedule, lessons, points, or program.
 */
export async function canOperateChild(childId: string): Promise<boolean> {
  if (!childId) return false;
  const user = await currentOperator();
  if (!user) return false;
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { teacherId: true, centerId: true },
  });
  if (!child) return false;
  if (user.role === "neurable_admin") return true;
  if (user.role === "center_admin") return Boolean(child.centerId) && child.centerId === user.centerId;
  return child.teacherId === user.id; // guide
}

/** The child themselves, signed in with their access code on their own device. */
async function childIsSignedIn(childId: string): Promise<boolean> {
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { accessCode: true } });
  if (!child?.accessCode) return false;
  const jar = await cookies();
  return jar.get(`nca_${childId}`)?.value === child.accessCode;
}

/**
 * May this request act within the child's own learning session? Everything an
 * operator can do, plus the child themselves (the live lesson calls tutor /
 * session / test / homework as the signed-in child).
 */
export async function canAccessChildSession(childId: string): Promise<boolean> {
  if (await canOperateChild(childId)) return true;
  return childIsSignedIn(childId);
}

const DENY = "You don't have access to that learner.";

/** For a route: 403 unless the operator may manage the child. Returns null when allowed. */
export async function guardOperate(childId: string): Promise<NextResponse | null> {
  return (await canOperateChild(childId)) ? null : NextResponse.json({ error: DENY }, { status: 403 });
}

/** For a route: 403 unless the caller may act in the child's session (operator or the child). */
export async function guardSession(childId: string): Promise<NextResponse | null> {
  return (await canAccessChildSession(childId)) ? null : NextResponse.json({ error: DENY }, { status: 403 });
}

/** For preview-style calls with no child: require at least a signed-in operator. */
export async function guardOperatorPresent(): Promise<NextResponse | null> {
  return (await currentOperator()) ? null : NextResponse.json({ error: "Not signed in." }, { status: 401 });
}
