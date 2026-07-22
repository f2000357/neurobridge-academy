import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// A child enters their own link + 8-digit code to reach their work.
// The cookie remembers the device so they only enter the code once.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function cookieName(childId: string) {
  return `nca_${childId}`;
}

// Child code entry (from the gate).
export async function POST(req: NextRequest) {
  const { childId, code } = await req.json();
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { accessCode: true } });
  const ok = Boolean(child && child.accessCode && String(code).trim() === child.accessCode);
  const res = NextResponse.json({ ok });
  if (ok) {
    res.cookies.set(cookieName(childId), child!.accessCode, {
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
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
  if (ok) {
    res.cookies.set(cookieName(childId), child!.accessCode, {
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}
