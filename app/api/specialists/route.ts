import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { newTeacherCode } from "@/lib/specialists";
import { guardOperate } from "@/lib/authz";
import { rosterChildIds } from "@/lib/access";
import { randomUUID } from "node:crypto";
import { send, teacherAdded, appUrl } from "@/lib/email";

// Managing visiting specialists. Anyone may add one — a center admin, or a
// homeschool parent who hired a piano teacher. The code itself is never
// returned by this route; only NeuroBridge admin can read it, through /api/admin.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Add a specialist, or find the one who already holds this email.
  if (op === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

    const existing = await prisma.specialistTeacher.findUnique({ where: { email } });
    if (existing) {
      // One profile per person. Reuse it rather than making a second Ravi —
      // but reveal nothing beyond who they are.
      return NextResponse.json({
        ok: true,
        existed: true,
        teacher: { id: existing.id, name: existing.name, specialty: existing.specialty },
      });
    }

    const teacher = await prisma.specialistTeacher.create({
      data: {
        email,
        name,
        phone: String(body.phone ?? "").trim(),
        specialty: String(body.specialty ?? "misc"),
        code: newTeacherCode(),
        createdById: user.id,
        createdByName: user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        action: "create_specialist",
        detail: `${teacher.name} (${teacher.email})`,
      },
    });
    // Deliberately no code in the response.
    return NextResponse.json({
      ok: true,
      existed: false,
      teacher: { id: teacher.id, name: teacher.name, specialty: teacher.specialty },
    });
  }

  if (op === "assign") {
    const { teacherId, childId, subject } = body as {
      teacherId: string;
      childId: string;
      subject?: string;
    };
    // You can only assign a specialist to a learner you manage.
    const denied = await guardOperate(childId);
    if (denied) return denied;
    const teacher = await prisma.specialistTeacher.findUnique({ where: { id: teacherId } });
    if (!teacher) return NextResponse.json({ error: "teacher not found" }, { status: 404 });
    const already = await prisma.teacherAssignment.findUnique({
      where: { teacherId_childId: { teacherId, childId } },
      select: { id: true },
    });
    await prisma.teacherAssignment.upsert({
      where: { teacherId_childId: { teacherId, childId } },
      create: { teacherId, childId, subject: subject || teacher.specialty },
      update: { subject: subject || teacher.specialty },
    });

    // First time this family has added them: tell them, with a way straight in.
    // No code to pass along — the link is the whole handover.
    let emailed = false;
    let link: string | undefined;
    if (!already && !teacher.archived) {
      const child = await prisma.child.findUnique({ where: { id: childId }, select: { name: true } });
      const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      await prisma.specialistLoginToken.create({
        data: { teacherId, token, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });
      const url = appUrl(`/teach/link/${token}`);
      const mail = teacherAdded({
        teacherName: teacher.name,
        childName: child?.name ?? "a learner",
        fromName: user.name,
        url,
      });
      const res = await send({ to: teacher.email, ...mail });
      emailed = res.sent;
      if (!res.sent) link = `/teach/link/${token}`;
    }
    return NextResponse.json({ ok: true, emailed, link });
  }

  // Send (or re-send) a specialist their way in.
  //
  // `assign` only mails on the FIRST assignment of a pair, so re-assigning
  // someone already on the child notified nobody and there was no other way to
  // reach them — a lost or never-sent invitation simply ended the relationship.
  // This always mints a fresh link and always reports what happened.
  if (op === "sendLink") {
    const { teacherId } = body as { teacherId: string };
    const teacher = await prisma.specialistTeacher.findUnique({ where: { id: teacherId } });
    if (!teacher || teacher.archived) {
      return NextResponse.json({ error: "teacher not found" }, { status: 404 });
    }
    // Yours to contact if you added them, or if they work with one of your
    // learners. Not "anyone signed in can mail any therapist".
    const mine = await rosterChildIds(user);
    const shared = await prisma.teacherAssignment.findFirst({
      where: { teacherId, childId: { in: mine } },
      include: { child: { select: { name: true } } },
    });
    if (!shared && teacher.createdById !== user.id) {
      return NextResponse.json({ error: "That teacher isn't one of yours." }, { status: 403 });
    }

    await prisma.specialistLoginToken.deleteMany({ where: { teacherId, usedAt: null } });
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    await prisma.specialistLoginToken.create({
      data: { teacherId, token, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    const url = appUrl(`/teach/link/${token}`);
    const mail = teacherAdded({
      teacherName: teacher.name,
      childName: shared?.child.name ?? "a learner",
      fromName: user.name,
      url,
    });
    const res = await send({ to: teacher.email, ...mail });
    return NextResponse.json({
      ok: true,
      emailed: res.sent,
      reason: res.sent ? undefined : res.reason,
      link: res.sent ? undefined : `/teach/link/${token}`,
    });
  }

  // Removing the grant. Notes they wrote stay — those are the learner's record.
  if (op === "unassign") {
    const { teacherId, childId } = body as { teacherId: string; childId: string };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    await prisma.teacherAssignment.deleteMany({ where: { teacherId, childId } });
    const child = await prisma.child.findUnique({ where: { id: childId }, select: { name: true } });
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        action: "unassign_specialist",
        detail: `removed a specialist from ${child?.name ?? "a learner"}`,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "update") {
    const { teacherId, name, phone, specialty } = body as {
      teacherId: string;
      name?: string;
      phone?: string;
      specialty?: string;
    };
    await prisma.specialistTeacher.update({
      where: { id: teacherId },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(phone != null ? { phone: phone.trim() } : {}),
        ...(specialty ? { specialty } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "archive") {
    const { teacherId, archived } = body as { teacherId: string; archived: boolean };
    await prisma.specialistTeacher.update({
      where: { id: teacherId },
      data: { archived: Boolean(archived) },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
