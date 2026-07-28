import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/authz";
import { getCurrentTeacher, teacherCanSee } from "@/lib/teacherAuth";
import { signedUrl, storageConfigured } from "@/lib/storage";

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

  // Authorization happened above. Supabase carries the bytes from here — a
  // 60MB video streamed through a serverless function hits every limit at once
  // — but the link dies in two minutes, so it is not something to forward.
  const url = await signedUrl(media.path, 120);
  if (!url) {
    return new NextResponse(
      storageConfigured() ? "Could not fetch that file" : "Media storage is not configured",
      { status: storageConfigured() ? 502 : 503 }
    );
  }
  return NextResponse.redirect(url, {
    // Never cached by anything shared: this is a photograph of a child, behind
    // a URL that is about to expire.
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function canRead(childId: string): Promise<boolean> {
  // Specialists first: getCurrentUser falls back to "the first guide" when no
  // operator is signed in, which would otherwise swallow the specialist case.
  const teacher = await getCurrentTeacher();
  if (teacher) return teacherCanSee(teacher.id, childId);

  // Every operator who may view the child — which is every guide on them, not
  // only the one Child.teacherId happens to point at.
  return can(childId, "view");
}
