import { NextRequest, NextResponse } from "next/server";
import { makeToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// DEV ONLY quick-login: become any operator without a password, for local work.
// Disabled in production, where /login is the only door. It mints a real signed
// session so the rest of the app behaves exactly as it will in production.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const to = url.searchParams.get("to") ?? "/";
  const res = NextResponse.redirect(new URL(to, url.origin));
  if (userId) res.cookies.set(SESSION_COOKIE, makeToken(userId, Date.now()), sessionCookieOptions());
  return res;
}
