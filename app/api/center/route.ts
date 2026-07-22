import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

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

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
