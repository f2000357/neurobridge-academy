import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Lesson marketplace: share, submit-for-global, promote, and copy-on-add.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no user" }, { status: 401 });

  // Guide sets a lesson's visibility (private or center) on one of their own.
  if (op === "setVisibility") {
    const { planId, visibility } = body as { planId: string; visibility: string };
    if (!["private", "center"].includes(visibility)) {
      return NextResponse.json({ error: "bad visibility" }, { status: 400 });
    }
    const plan = await prisma.lessonPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.teacherId !== me.id) return NextResponse.json({ error: "not yours" }, { status: 403 });
    await prisma.lessonPlan.update({ where: { id: planId }, data: { visibility } });
    return NextResponse.json({ ok: true });
  }

  // Guide nominates a lesson for the global shelf (also shares it to their center).
  if (op === "submitForGlobal") {
    const { planId } = body as { planId: string };
    const plan = await prisma.lessonPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.teacherId !== me.id) return NextResponse.json({ error: "not yours" }, { status: 403 });
    await prisma.lessonPlan.update({
      where: { id: planId },
      data: { submittedForGlobal: true, visibility: plan.visibility === "private" ? "center" : plan.visibility },
    });
    return NextResponse.json({ ok: true });
  }

  // Neurable admin promotes a submitted lesson onto the global shelf.
  if (op === "promote") {
    if (me.role !== "neurable_admin") return NextResponse.json({ error: "not allowed" }, { status: 403 });
    const { planId } = body as { planId: string };
    const plan = await prisma.lessonPlan.findUnique({ where: { id: planId } });
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.lessonPlan.update({
      where: { id: planId },
      data: { visibility: "global", submittedForGlobal: false },
    });
    await prisma.auditLog.create({
      data: { actorId: me.id, actorName: me.name, action: "promote_lesson", detail: `${plan.title} → global` },
    });
    return NextResponse.json({ ok: true });
  }

  // Add a shared lesson to my library as a private copy I can tailor.
  if (op === "copyToMe") {
    const { planId } = body as { planId: string };
    const src = await prisma.lessonPlan.findUnique({ where: { id: planId } });
    if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });
    // Only copyable if it's shared to me (center in my center, or global).
    const canSee =
      src.visibility === "global" || (src.visibility === "center" && src.centerId === me.centerId);
    if (!canSee) return NextResponse.json({ error: "not shared with you" }, { status: 403 });
    const copy = await prisma.lessonPlan.create({
      data: {
        teacherId: me.id,
        centerId: me.centerId,
        visibility: "private",
        copiedFromId: src.id,
        childId: null,
        title: src.title,
        subject: src.subject,
        gradeLevel: src.gradeLevel,
        topic: src.topic,
        standardCode: src.standardCode,
        standardText: src.standardText,
        goal: src.goal,
        whyItMatters: src.whyItMatters,
        chunks: src.chunks,
        durationMin: src.durationMin,
        renderer: src.renderer,
        published: true,
      },
    });
    return NextResponse.json({ ok: true, id: copy.id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
