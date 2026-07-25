import { NextRequest, NextResponse } from "next/server";
import { makeToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { switchEnabled } from "@/lib/demo";

// Quick-login: become any operator without a password. On for local dev, and on
// a hosted build ONLY when DEMO_SWITCH=1 (see lib/demo.ts) — otherwise /login is
// the only door. It mints a real signed session so the rest of the app behaves
// exactly as it will in production.
export async function GET(req: NextRequest) {
  if (!switchEnabled) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const to = url.searchParams.get("to") ?? "/";
  const res = NextResponse.redirect(new URL(to, url.origin));
  if (userId) res.cookies.set(SESSION_COOKIE, makeToken(userId, Date.now()), sessionCookieOptions());
  return res;
}
