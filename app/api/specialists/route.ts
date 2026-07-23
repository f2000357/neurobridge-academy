import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { newTeacherCode } from "@/lib/specialists";

// Managing visiting specialists. Anyone may add one — a center admin, or a
// homeschool parent who hired a piano teacher. The code itself is never
// returned by this route; only Neurable admin can read it, through /api/admin.

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
    const teacher = await prisma.specialistTeacher.findUnique({ where: { id: teacherId } });
    if (!teacher) return NextResponse.json({ error: "teacher not found" }, { status: 404 });
    await prisma.teacherAssignment.upsert({
      where: { teacherId_childId: { teacherId, childId } },
      create: { teacherId, childId, subject: subject || teacher.specialty },
      update: { subject: subject || teacher.specialty },
    });
    return NextResponse.json({ ok: true });
  }

  // Removing the grant. Notes they wrote stay — those are the learner's record.
  if (op === "unassign") {
    const { teacherId, childId } = body as { teacherId: string; childId: string };
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
