import { NextRequest, NextResponse } from "next/server";

// Dev role switcher: set the current-operator cookie and go to their home.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const to = url.searchParams.get("to") ?? "/";
  const res = NextResponse.redirect(new URL(to, url.origin));
  res.cookies.set("nb_user", userId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
