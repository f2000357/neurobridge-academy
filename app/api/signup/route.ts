import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, passwordProblem } from "@/lib/password";
import { makeToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { usernameFrom } from "@/lib/username";
import { grantAccess } from "@/lib/access";
import { audit } from "@/lib/audit";

// Self-serve signup. A parent creates their own account and their first child,
// with no admin and no centre involved — that is the whole product: a family can
// start alone and stay alone. Joining a centre is a later, optional choice.
//
// A Subscription is created at £0. The record exists from day one so that adding
// a price later is a pricing change, not a re-architecture.

const CODE = () => String(Math.floor(10000000 + Math.random() * 90000000));

async function uniqueUsername(name: string): Promise<string> {
  const base = usernameFrom(name) || "learner";
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.child.findFirst({ where: { username: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // Does this email already have an account? Used by the form to steer someone
  // to sign in instead of failing after they have typed everything.
  if (op === "checkEmail") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ taken: false });
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return NextResponse.json({ taken: Boolean(existing) });
  }

  if (op === "signup") {
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const childName = String(body.childName ?? "").trim();
    const childAge = body.childAge == null || body.childAge === "" ? null : Number(body.childAge);
    const gradeLevel = String(body.gradeLevel ?? "").trim();

    if (!name) return NextResponse.json({ error: "What should we call you?" }, { status: 400 });
    if (!email.includes("@")) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    const pw = passwordProblem(password);
    if (pw) return NextResponse.json({ error: pw }, { status: 400 });
    if (!childName) return NextResponse.json({ error: "Add your child's name." }, { status: 400 });

    const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (clash) {
      return NextResponse.json(
        { error: "There's already an account with that email. Sign in instead." },
        { status: 400 }
      );
    }

    // A parent is a guide with no centre. Centre membership, if they ever want it,
    // is requested later and approved by that centre.
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: "guide",
        centerId: null,
        passwordHash: await hashPassword(password),
      },
    });

    await prisma.subscription.create({
      data: { userId: user.id, plan: "free", amountCents: 0, status: "active" },
    });

    const child = await prisma.child.create({
      data: {
        teacherId: user.id,
        centerId: null,
        name: childName,
        username: await uniqueUsername(childName),
        age: Number.isFinite(childAge as number) ? (childAge as number) : null,
        gradeLevel,
        accessCode: CODE(),
        profile: { create: {} },
      },
    });

    // The parent is the primary guide: they decide who else may manage the child.
    await grantAccess({ childId: child.id, userId: user.id, role: "primary_guide" });

    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "signup",
      childId: child.id,
      detail: `${user.name} signed up and added ${child.name}`,
    });

    const res = NextResponse.json({ ok: true, childId: child.id, home: "/teacher" });
    res.cookies.set(SESSION_COOKIE, makeToken(user.id, Date.now()), sessionCookieOptions());
    return res;
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
