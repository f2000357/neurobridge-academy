import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/authz";
import { getCurrentTeacher, teacherCanSee } from "@/lib/teacherAuth";

// Serves a child's picture.
//
// This is a photograph of a minor, so it is NOT public: every request is
// authorized the same way the child's other records are. Two kinds of caller are
// allowed — an operator who may view the child (their guides), and a specialist
// currently assigned to them. Revoke a therapist and this 404s on their next
// load, exactly like the rest of their access.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;

  let allowed = await can(childId, "view");
  if (!allowed) {
    const teacher = await getCurrentTeacher();
    allowed = Boolean(teacher && (await teacherCanSee(teacher.id, childId)));
  }
  // Deliberately 404 rather than 403: to a caller with no access, a child they
  // may not see and a child who does not exist should look identical.
  if (!allowed) return new NextResponse(null, { status: 404 });

  const photo = await prisma.childPhoto.findUnique({
    where: { childId },
    select: { mimeType: true, data: true, updatedAt: true },
  });
  if (!photo) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(photo.data, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(bytes.length),
      // Private: a shared cache must never hold a child's photograph. The
      // revalidation window is short so a replaced picture appears promptly.
      "Cache-Control": "private, max-age=60, must-revalidate",
      ETag: `"${photo.updatedAt.getTime()}"`,
    },
  });
}
