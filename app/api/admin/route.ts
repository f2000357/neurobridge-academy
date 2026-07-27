import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";

// NeuroBridge-admin actions: stand up centers and staff accounts.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };
  const me = await getCurrentUser();
  if (!me || me.role !== "neurable_admin") {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  if (op === "createCenter") {
    const { name, region } = body as { name: string; region?: string };
    if (!name?.trim()) return NextResponse.json({ error: "Name the center." }, { status: 400 });
    const center = await prisma.center.create({ data: { name: name.trim(), region: region?.trim() || "" } });
    await prisma.auditLog.create({
      data: { actorId: me.id, actorName: me.name, action: "create_center", detail: center.name },
    });
    return NextResponse.json({ ok: true, id: center.id });
  }

  if (op === "createUser") {
    const { name, email, role, centerId } = body as {
      name: string;
      email?: string;
      role: string;
      centerId?: string;
      password?: string;
    };
    if (!name?.trim()) return NextResponse.json({ error: "Name the staff member." }, { status: 400 });
    if (!["center_admin", "guide"].includes(role)) {
      return NextResponse.json({ error: "Pick a role." }, { status: 400 });
    }
    if (!centerId) return NextResponse.json({ error: "Pick a center." }, { status: 400 });
    // An operator needs an email (their login) and an initial password to sign in.
    if (!body.email?.trim()) return NextResponse.json({ error: "Give them an email to sign in with." }, { status: 400 });
    const clash = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 400 });
    const pwProblem = passwordProblem(String(body.password ?? ""));
    if (pwProblem) return NextResponse.json({ error: `Initial password: ${pwProblem}` }, { status: 400 });
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: body.email.trim().toLowerCase(),
        role,
        centerId,
        passwordHash: await hashPassword(String(body.password)),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        actorName: me.name,
        action: "create_user",
        detail: `${user.name} (${role})`,
      },
    });
    return NextResponse.json({ ok: true, id: user.id });
  }

  // Move a learner between centers, or out of a center to homeschool.
  // All three cases are the same change: set the center (or null) and hand them
  // to a guide who belongs in that scope. Their work follows automatically,
  // because everything is keyed to the learner, not the center.
  // A centre with no admin is a centre nobody can open. Creating one doesn't
  // create a person, so this promotes an existing account into the seat — a
  // NeuroBridge job, per the rule that centres don't staff themselves.
  if (op === "setCenterAdmin") {
    const { userId, centerId } = body as { userId: string; centerId: string | null };
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!target) return NextResponse.json({ error: "Person not found." }, { status: 404 });

    if (centerId) {
      const center = await prisma.center.findUnique({ where: { id: centerId }, select: { name: true } });
      if (!center) return NextResponse.json({ error: "Centre not found." }, { status: 404 });
      await prisma.user.update({
        where: { id: userId },
        data: { role: "center_admin", centerId },
      });
      await prisma.auditLog.create({
        data: {
          actorId: me.id,
          actorName: me.name,
          action: "set_center_admin",
          detail: `${target.name} now runs ${center.name}`,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Stepping them back down: a guide again, with no centre.
    await prisma.user.update({ where: { id: userId }, data: { role: "guide", centerId: null } });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        actorName: me.name,
        action: "set_center_admin",
        detail: `${target.name} no longer runs a centre`,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "moveLearner") {
    const { childId, toCenterId, toGuideId } = body as {
      childId: string;
      toCenterId: string | null;
      toGuideId: string;
    };
    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: { center: { select: { name: true } }, teacher: { select: { name: true } } },
    });
    const toGuide = await prisma.user.findUnique({ where: { id: toGuideId } });
    if (!child || !toGuide) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (toGuide.role !== "guide") {
      return NextResponse.json({ error: "Pick a guide to receive them." }, { status: 400 });
    }
    const target = toCenterId || null;
    // The receiving guide must actually belong where the learner is going.
    if ((toGuide.centerId ?? null) !== target) {
      return NextResponse.json(
        { error: "That guide isn't in the destination — pick a guide from there." },
        { status: 400 }
      );
    }
    if (target) {
      const center = await prisma.center.findUnique({ where: { id: target } });
      if (!center) return NextResponse.json({ error: "center not found" }, { status: 404 });
    }

    await prisma.child.update({
      where: { id: childId },
      data: { centerId: target, teacherId: toGuideId },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        actorName: me.name,
        action: "move_learner",
        detail:
          `${child.name}: ${child.center?.name ?? "Homeschool"} (${child.teacher.name}) → ` +
          `${target ? (await prisma.center.findUnique({ where: { id: target } }))?.name : "Homeschool"} (${toGuide.name})`,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
