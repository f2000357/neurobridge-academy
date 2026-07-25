import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// A child signs in with their username (e.g. "paiyer") and 8-digit code — or
// lands on their personalized link, which supplies the username and only asks
// for the code. Either way a device cookie remembers them for 30 days.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function cookieName(childId: string) {
  return `nca_${childId}`;
}

// httpOnly so the code can't be read out of the cookie by page scripts; the
// student page reads it server-side.
function setAccessCookie(res: NextResponse, childId: string, accessCode: string) {
  res.cookies.set(cookieName(childId), accessCode, {
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
}

async function resolveChild(opts: { childId?: string; username?: string }) {
  const username = opts.username?.trim().toLowerCase();
  if (username) {
    return prisma.child.findFirst({
      where: { username, archived: false },
      select: { id: true, accessCode: true, username: true },
    });
  }
  if (opts.childId) {
    return prisma.child.findUnique({
      where: { id: opts.childId },
      select: { id: true, accessCode: true, username: true },
    });
  }
  return null;
}

// Sign-in from the front door (username + code) or the per-link gate (childId + code).
export async function POST(req: NextRequest) {
  const { childId, username, code } = await req.json();
  const child = await resolveChild({ childId, username });
  const ok = Boolean(child?.accessCode) && String(code ?? "").trim() === child!.accessCode;
  if (!ok) return NextResponse.json({ ok: false });
  const res = NextResponse.json({ ok: true, redirect: `/student/${child!.username ?? child!.id}` });
  setAccessCookie(res, child!.id, child!.accessCode);
  return res;
}

// Guide's one-click launch: verify code from the query, set the cookie, redirect in.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const childId = url.searchParams.get("childId") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const redirect = url.searchParams.get("redirect") || `/student/${childId}`;
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { accessCode: true } });
  const ok = Boolean(child && child.accessCode && code === child.accessCode);
  const res = NextResponse.redirect(new URL(ok ? redirect : `/student/${childId}`, req.url));
  if (ok) setAccessCookie(res, childId, child!.accessCode);
  return res;
}
