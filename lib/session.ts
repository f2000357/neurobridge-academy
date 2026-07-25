import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Operator sessions as an HMAC-signed cookie: "<userId>.<exp>.<sig>". The
// signature is HMAC-SHA256 over "userId.exp" with a server secret, so the
// cookie can't be forged (unlike the old raw-id cookie). Stateless — no session
// table — which is enough for a first real login; DB-backed revocation can come
// later.

export const SESSION_COOKIE = "nb_session";
const MAX_AGE_S = 60 * 60 * 24 * 14; // 14 days

// A real deployment MUST set SESSION_SECRET. The dev fallback keeps local work
// running but is not secret — sessions signed with it are only trustworthy in dev.
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-session-secret";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function makeToken(userId: string, nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + MAX_AGE_S;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the userId if the token is well-formed, correctly signed, and unexpired. */
export function readToken(token: string | undefined, nowMs: number): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const expected = sign(`${userId}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return null;
  return userId;
}

/** The signed-in operator's id from the request cookie, or null. */
export async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return readToken(jar.get(SESSION_COOKIE)?.value, Date.now());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_S,
    secure: process.env.NODE_ENV === "production",
  };
}
