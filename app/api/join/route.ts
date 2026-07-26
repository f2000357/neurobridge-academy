import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, passwordProblem } from "@/lib/password";
import { makeToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { grantAccess } from "@/lib/access";
import { audit, AUDIT } from "@/lib/audit";

// Accepting a parent's invitation to help guide their child. Creates the account
// if there isn't one, grants access, and signs them in — no admin and no centre in
// the loop, which is the point of a parent-driven product.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();

  const invite = await prisma.guideInvitation.findUnique({ where: { token } });
  if (
    !invite ||
    invite.revokedAt !== null ||
    invite.acceptedAt !== null ||
    invite.expiresAt.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "This invitation isn't valid any more." }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { email: invite.email } });

  if (user) {
    // Existing account: this is a sign-in, so the password must be theirs.
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "That password doesn't match this account." }, { status: 401 });
    }
  } else {
    const pw = passwordProblem(password);
    if (pw) return NextResponse.json({ error: pw }, { status: 400 });
    if (!name) return NextResponse.json({ error: "What should we call you?" }, { status: 400 });
    // A guide has no centre — they are tied to a child, not an institution.
    user = await prisma.user.create({
      data: {
        name,
        email: invite.email,
        role: "guide",
        centerId: null,
        passwordHash: await hashPassword(password),
      },
    });
  }

  await grantAccess({
    childId: invite.childId,
    userId: user.id,
    role: "guide",
    invitedById: invite.invitedById,
  });
  await prisma.guideInvitation.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  const child = await prisma.child.findUnique({
    where: { id: invite.childId },
    select: { name: true },
  });
  await audit({
    actorId: user.id,
    actorName: user.name,
    action: AUDIT.accessGranted,
    childId: invite.childId,
    detail: `${user.name} accepted an invitation to help with ${child?.name ?? "a learner"}`,
    after: "guide",
  });

  const res = NextResponse.json({ ok: true, home: "/teacher" });
  res.cookies.set(SESSION_COOKIE, makeToken(user.id, Date.now()), sessionCookieOptions());
  return res;
}
