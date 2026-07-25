import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { uniqueUsername, newAccessCode } from "@/lib/childSetup";
import { hashPassword, passwordProblem } from "@/lib/password";

// Center-admin actions: move a learner to a different guide in the same center.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };
  const me = await getCurrentUser();
  if (!me || (me.role !== "center_admin" && me.role !== "neurable_admin")) {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  if (op === "transfer") {
    const { childId, toGuideId } = body as { childId: string; toGuideId: string };
    const child = await prisma.child.findUnique({ where: { id: childId }, include: { teacher: true } });
    const toGuide = await prisma.user.findUnique({ where: { id: toGuideId } });
    if (!child || !toGuide) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (toGuide.role !== "guide") return NextResponse.json({ error: "target is not a guide" }, { status: 400 });
    // Stay within one center (center admins can only move inside their center).
    if (me.role === "center_admin" && (child.centerId !== me.centerId || toGuide.centerId !== me.centerId)) {
      return NextResponse.json({ error: "outside your center" }, { status: 403 });
    }
    if (child.centerId !== toGuide.centerId) {
      return NextResponse.json({ error: "guide is in a different center" }, { status: 400 });
    }

    await prisma.child.update({ where: { id: childId }, data: { teacherId: toGuideId } });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        actorName: me.name,
        action: "transfer_learner",
        detail: `${child.name}: ${child.teacher.name} → ${toGuide.name}`,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "setArchived") {
    const { childId, archived } = body as { childId: string; archived: boolean };
    const child = await prisma.child.findUnique({ where: { id: childId } });
    if (!child) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (me.role === "center_admin" && child.centerId !== me.centerId) {
      return NextResponse.json({ error: "outside your center" }, { status: 403 });
    }
    await prisma.child.update({ where: { id: childId }, data: { archived: Boolean(archived) } });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        actorName: me.name,
        action: archived ? "archive_learner" : "restore_learner",
        detail: child.name,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Permanent removal — only allowed once a learner is archived (a safety gate).
  if (op === "deleteLearner") {
    const { childId } = body as { childId: string };
    const child = await prisma.child.findUnique({ where: { id: childId } });
    if (!child) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (me.role === "center_admin" && child.centerId !== me.centerId) {
      return NextResponse.json({ error: "outside your center" }, { status: 403 });
    }
    if (!child.archived) {
      return NextResponse.json({ error: "Deactivate the learner before removing them." }, { status: 400 });
    }
    await prisma.child.delete({ where: { id: childId } }); // cascades profile/slots/sessions/etc.
    await prisma.auditLog.create({
      data: { actorId: me.id, actorName: me.name, action: "delete_learner", detail: child.name },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "addGuide") {
    const { name, email, password } = body as { name: string; email?: string; password?: string };
    if (!me.centerId) return NextResponse.json({ error: "no center" }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: "Name the guide." }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "Give them an email to sign in with." }, { status: 400 });
    const clash = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 400 });
    const pwProblem = passwordProblem(String(password ?? ""));
    if (pwProblem) return NextResponse.json({ error: `Initial password: ${pwProblem}` }, { status: 400 });
    const guide = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: "guide",
        centerId: me.centerId,
        passwordHash: await hashPassword(String(password)),
      },
    });
    return NextResponse.json({ ok: true, id: guide.id });
  }

  if (op === "addLearner") {
    const { name, guideId } = body as { name: string; guideId: string };
    if (!me.centerId) return NextResponse.json({ error: "no center" }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: "Name the learner." }, { status: 400 });
    const guide = await prisma.user.findUnique({ where: { id: guideId } });
    if (!guide || guide.role !== "guide" || guide.centerId !== me.centerId) {
      return NextResponse.json({ error: "Pick a guide in your center." }, { status: 400 });
    }
    const child = await prisma.child.create({
      data: {
        name: name.trim(),
        teacherId: guideId,
        centerId: me.centerId,
        username: await uniqueUsername(name.trim()),
        accessCode: newAccessCode(),
        profile: { create: {} },
      },
    });
    return NextResponse.json({ ok: true, id: child.id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
