import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, passwordProblem } from "@/lib/password";
import { makeToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { getCurrentUser, homeForRole } from "@/lib/auth";

// Operator sign-in for guides, center admins, and NeuroBridge admins.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "login") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    // One generic message for bad email, no password set, or wrong password —
    // don't reveal which accounts exist or are provisioned.
    const fail = () =>
      NextResponse.json({ error: "That email and password don't match." }, { status: 401 });

    if (!email || !password) return fail();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return fail();
    if (!(await verifyPassword(password, user.passwordHash))) return fail();

    const res = NextResponse.json({ ok: true, home: homeForRole(user.role) });
    res.cookies.set(SESSION_COOKIE, makeToken(user.id, Date.now()), sessionCookieOptions());
    return res;
  }

  if (op === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Change your own password (must prove the current one).
  if (op === "changePassword") {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const current = String(body.currentPassword ?? "");
    const next = String(body.newPassword ?? "");
    // A user who already has a password must confirm it; one with none is setting it first.
    if (me.passwordHash) {
      if (!(await verifyPassword(current, me.passwordHash))) {
        return NextResponse.json({ error: "Your current password is wrong." }, { status: 403 });
      }
    }
    const problem = passwordProblem(next);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
