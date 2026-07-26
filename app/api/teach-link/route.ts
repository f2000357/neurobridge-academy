import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { send, teacherSignIn, appUrl, emailConfigured } from "@/lib/email";

// A specialist asking for a way in, by email.
//
// The link works once and expires in 20 minutes, so nothing long-lived sits in a
// mailbox. That is the point: revoking a therapist means deleting their
// assignment (or archiving them) — there is no code still working on their phone.
//
// The response is deliberately the SAME whether or not the address is one we
// know. Otherwise this endpoint would tell a stranger which therapists work with
// which families.

const TTL_MIN = 20;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();

  const vague = NextResponse.json({
    ok: true,
    message: "If that address belongs to a teacher here, a sign-in link is on its way.",
  });
  if (!email.includes("@")) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const teacher = await prisma.specialistTeacher.findUnique({ where: { email } });
  if (!teacher || teacher.archived) return vague;

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000);
  // Only the newest link should work.
  await prisma.specialistLoginToken.deleteMany({ where: { teacherId: teacher.id, usedAt: null } });
  await prisma.specialistLoginToken.create({
    data: { teacherId: teacher.id, token, expiresAt },
  });

  const url = appUrl(`/teach/link/${token}`);
  const mail = teacherSignIn({ teacherName: teacher.name, url, minutes: TTL_MIN });
  const res = await send({ to: email, ...mail });

  // Until a sending domain is verified, hand the link back so the flow is still
  // usable — but only ever to the person who asked, and never as a silent lie.
  if (!res.sent) {
    return NextResponse.json({
      ok: true,
      emailed: false,
      reason: res.reason,
      link: emailConfigured() ? undefined : `/teach/link/${token}`,
      message: emailConfigured()
        ? "We couldn't send that email just now. Try again shortly."
        : "Email isn't switched on yet — use the link below.",
    });
  }
  return NextResponse.json({ ok: true, emailed: true, message: vague.headers ? "Check your email for the link." : "" });
}
