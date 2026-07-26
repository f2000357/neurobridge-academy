import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TEACHER_COOKIE } from "@/lib/teacherAuth";

// Consuming a specialist's one-time sign-in link.
//
// A Route Handler rather than a page, because cookies can only be written from a
// Route Handler or Server Action — setting one while rendering throws.

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const row = await prisma.specialistLoginToken.findUnique({
    where: { token },
    include: { teacher: { select: { id: true, archived: true } } },
  });

  const dead =
    !row || row.usedAt !== null || row.expiresAt.getTime() < Date.now() || row.teacher.archived;

  if (dead) {
    // Back to the door, with a word about why.
    return NextResponse.redirect(new URL("/teach?expired=1", req.url));
  }

  await prisma.specialistLoginToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  const res = NextResponse.redirect(new URL("/teach", req.url));
  res.cookies.set(TEACHER_COOKIE, row.teacher.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // a working day
  });
  return res;
}
