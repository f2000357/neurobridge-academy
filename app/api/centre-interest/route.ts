import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { send, centreInterest } from "@/lib/email";

// "Bring a centre to my town."
//
// The only route in the app a complete stranger can POST to, so it is written
// defensively: a honeypot field, a per-IP rate limit, hard length caps, and no
// detail in the response that would help someone probe it.
//
// The submission is STORED as well as emailed. A send that fails would otherwise
// silently lose a family who raised their hand, and the rows are the only honest
// answer to which town to open first.

const NOTIFY = "gayathri.c.sekar@gmail.com";

const MAX = { name: 80, email: 120, town: 100, childAge: 20, note: 800 };

// Per-IP window. In-memory, so on serverless it is per-instance rather than
// global — enough to stop a naive script, not a determined one. A shared store
// is the upgrade if this ever gets abused.
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > LIMIT;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Honeypot: a field hidden from people and irresistible to bots. Answer 200 so
  // a script sees success and doesn't retry with the field removed.
  if (clean((body as Record<string, unknown>).website, 40)) {
    return NextResponse.json({ ok: true });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "That's a few requests in a row — try again a bit later." },
      { status: 429 }
    );
  }

  const name = clean((body as Record<string, unknown>).name, MAX.name);
  const email = clean((body as Record<string, unknown>).email, MAX.email).toLowerCase();
  const town = clean((body as Record<string, unknown>).town, MAX.town);
  const childAge = clean((body as Record<string, unknown>).childAge, MAX.childAge);
  const note = clean((body as Record<string, unknown>).note, MAX.note);

  if (!email.includes("@") || email.length < 5) {
    return NextResponse.json({ error: "Please add an email we can reply to." }, { status: 400 });
  }
  if (!town) {
    return NextResponse.json({ error: "Which town or city are you in?" }, { status: 400 });
  }

  const mail = centreInterest({ name, email, town, childAge, note });
  const res = await send({ to: NOTIFY, replyTo: email, ...mail });

  // Stored either way, with whether the notification actually left.
  await prisma.centreInterest.create({
    data: { name, email, town, childAge, note, emailed: res.sent },
  });

  // The person gets the same friendly answer whether or not our mail worked —
  // their part is done, and a delivery problem is ours to notice, not theirs.
  return NextResponse.json({ ok: true });
}
