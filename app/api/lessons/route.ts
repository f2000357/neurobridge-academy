import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { tutorText } from "@/lib/ai";
import { saveUpload, MAX_IMAGE_BYTES } from "@/lib/uploads";
import { subjectKey } from "@/lib/subjects";
import type { Prisma } from "@prisma/client";

// Lesson marketplace: share, submit-for-global, promote, and copy-on-add.
export async function POST(req: NextRequest) {
  // An image added to a step while previewing arrives as multipart.
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return handleAssetUpload(req);
  }

  const body = await req.json();
  const { op } = body as { op: string };
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no user" }, { status: 401 });

  // Save one step back to the lesson. What the guide writes here is what the
  // child reads — `verbatim` stops the tutor from regenerating over the top.
  if (op === "saveChunk") {
    const { planId, index, chunk } = body as { planId: string; index: number; chunk: unknown };
    const plan = await prisma.lessonPlan.findUnique({ where: { id: planId } });
    if (!plan) return NextResponse.json({ error: "lesson not found" }, { status: 404 });
    if (plan.teacherId !== me.id && me.role !== "neurable_admin") {
      return NextResponse.json({ error: "not your lesson" }, { status: 403 });
    }
    let chunks: unknown[] = [];
    try {
      chunks = JSON.parse(plan.chunks);
    } catch {
      chunks = [];
    }
    if (index < 0 || index >= chunks.length) {
      return NextResponse.json({ error: "no such step" }, { status: 400 });
    }
    chunks[index] = chunk;
    await prisma.lessonPlan.update({
      where: { id: planId },
      data: { chunks: JSON.stringify(chunks) },
    });
    return NextResponse.json({ ok: true });
  }

  // Alternative-skill picker: real IXL skills from the content index, for a
  // subject + grade (optionally narrowed to one standard, or a name search). The
  // guide swaps a Practice step's deep link to any of these — always a real link.
  if (op === "indexSkills") {
    const { subject, grade, standardCode, q } = body as {
      subject?: string;
      grade?: string;
      standardCode?: string;
      q?: string;
    };
    const where: Prisma.ContentItemWhereInput = { active: true };
    if (subject) where.subject = subjectKey(subject);
    if (grade) where.gradeLevel = grade;
    if (standardCode) where.standardCode = standardCode;
    if (q && q.trim()) where.skillName = { contains: q.trim(), mode: "insensitive" };
    const items = await prisma.contentItem.findMany({
      where,
      orderBy: [{ provider: "asc" }, { standardCode: "asc" }, { skillName: "asc" }],
      take: 40,
      select: {
        provider: true,
        standardCode: true,
        gradeLevel: true,
        skillName: true,
        videoUrl: true,
        practiceUrl: true,
      },
    });
    return NextResponse.json({ ok: true, items });
  }

  // "Make this shorter" — the guide keeps the result or edits it further.
  if (op === "rewrite") {
    const { text, how } = body as { text: string; how?: string };
    if (!text?.trim()) return NextResponse.json({ error: "nothing to rewrite" }, { status: 400 });
    const instruction =
      how === "simpler"
        ? "Rewrite it in plainer, more literal language for a child who reads below grade level. Keep every idea."
        : "Cut it to about half the length. Keep the worked example and the one core idea; drop repetition and throat-clearing.";
    const out = await tutorText(
      "You edit teaching passages for neurodiverse learners. Short sentences, literal language, no Markdown, no preamble — return only the rewritten passage.",
      `${instruction}\n\nPassage:\n${text}`,
      600,
      "plan"
    );
    if (!out) return NextResponse.json({ error: "The rewrite didn't come back. Try again." }, { status: 502 });
    return NextResponse.json({ ok: true, text: out });
  }

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

  // NeuroBridge admin promotes a submitted lesson onto the global shelf.
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
        workUrl: src.workUrl,
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

// A diagram or photo the guide attaches to a step.
async function handleAssetUpload(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no user" }, { status: 401 });

  const form = await req.formData();
  const planId = String(form.get("planId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });

  const plan = await prisma.lessonPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: "lesson not found" }, { status: 404 });
  if (plan.teacherId !== me.id && me.role !== "neurable_admin") {
    return NextResponse.json({ error: "not your lesson" }, { status: 403 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Images only for lesson steps." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That image is too large — keep it under 8 MB." }, { status: 413 });
  }

  const saved = await saveUpload(file, `lessons/${planId}`);
  const asset = await prisma.lessonAsset.create({
    data: {
      lessonId: planId,
      filename: file.name || "image",
      mimeType: file.type,
      bytes: file.size,
      path: saved.path,
    },
  });
  return NextResponse.json({ ok: true, assetId: asset.id });
}
