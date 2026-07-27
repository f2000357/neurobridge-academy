import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentTeacher, teacherCanSee } from "@/lib/teacherAuth";
import { resolveUpload } from "@/lib/uploads";

// Serves a note's photo or video. Never public: an operator (guide, center,
// NeuroBridge admin) or a specialist still assigned to that learner.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  const media = await prisma.teacherMedia.findUnique({
    where: { id: mediaId },
    include: { note: { select: { childId: true } } },
  });
  if (!media) return new NextResponse("Not found", { status: 404 });

  const allowed = await canRead(media.note.childId);
  if (!allowed) return new NextResponse("Not allowed", { status: 403 });

  const abs = resolveUpload(media.path);
  if (!abs) return new NextResponse("Not found", { status: 404 });
  let size: number;
  try {
    size = statSync(abs).size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": media.mimeType || "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

async function canRead(childId: string): Promise<boolean> {
  // Specialists first: getCurrentUser falls back to "the first guide" when no
  // operator is signed in, which would otherwise swallow the specialist case.
  const teacher = await getCurrentTeacher();
  if (teacher) return teacherCanSee(teacher.id, childId);

  const user = await getCurrentUser({ select: { id: true, role: true, centerId: true } });
  if (user) {
    if (user.role === "neurable_admin") return true;
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: { teacherId: true, centerId: true },
    });
    if (!child) return false;
    // Centre membership grants access on top of anything held as a guide.
    if (user.role === "center_admin" && Boolean(child.centerId) && child.centerId === user.centerId) {
      return true;
    }
    return child.teacherId === user.id; // the guide
  }
  return false;
}
