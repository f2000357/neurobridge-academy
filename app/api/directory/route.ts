import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOperator } from "@/lib/authz";
import { getCurrentTeacher } from "@/lib/teacherAuth";

// The therapist directory.
//
// Two halves, deliberately in one file because they share one rule: a listing
// exists only because the therapist said it could.
//
//   search  — a signed-in guide looks for help. Never public: a directory of
//             people who work alone with disabled children, with their phone
//             numbers, has no business being on the open web.
//   setListing — the therapist themselves opts in, edits, or opts out.
//
// A listing carries nothing we derived: no client count, no rating, no "added
// by N families". Those either expose families or make NeuroBridge a voucher
// for people it has never met.

const PAGE = 40;

// Signed-in is not the same as trusted — one account could page through and
// harvest the lot. Per-instance, so it stops a script rather than a determined
// person; a shared store is the upgrade if that ever matters.
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 60;

function tooMany(key: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(key, recent);
  return recent.length > LIMIT;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // ── a parent looks for help ───────────────────────────────────────────────
  if (op === "search") {
    // Guides and centre admins only. Not learners, and not other specialists —
    // a therapist browsing therapists is a different product with different
    // consent behind it.
    const me = await currentOperator();
    if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    if (tooMany(me.id)) {
      return NextResponse.json({ error: "Too many searches — try again shortly." }, { status: 429 });
    }

    const specialty = String(body.specialty ?? "").trim();
    const town = String(body.town ?? "").trim();
    const telehealth = Boolean(body.telehealth);

    const rows = await prisma.specialistTeacher.findMany({
      where: {
        listed: true,
        archived: false,
        ...(specialty ? { specialty } : {}),
        ...(town ? { town: { contains: town, mode: "insensitive" } } : {}),
        ...(telehealth ? { telehealth: true } : {}),
      },
      // Whoever is actually taking clients first — that is the scarce
      // information. Then alphabetical: there is no ranking to sell.
      orderBy: [{ takingClients: "desc" }, { name: "asc" }],
      take: PAGE,
      select: {
        id: true,
        name: true,
        specialty: true,
        credentials: true,
        town: true,
        region: true,
        telehealth: true,
        agesServed: true,
        blurb: true,
        takingClients: true,
        availableAt: true,
        phone: true,
        email: true,
      },
    });

    return NextResponse.json({
      results: rows.map((r) => ({
        ...r,
        availableAt: r.availableAt ? r.availableAt.toISOString() : null,
      })),
      capped: rows.length === PAGE,
    });
  }

  // ── the therapist decides ─────────────────────────────────────────────────
  if (op === "setListing") {
    const me = await getCurrentTeacher();
    if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const listed = Boolean(body.listed);
    const clean = (k: string, max: number) =>
      String((body as Record<string, unknown>)[k] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);

    await prisma.specialistTeacher.update({
      where: { id: me.id },
      data: {
        listed,
        listedAskedAt: new Date(),
        ...(listed
          ? {
              town: clean("town", 80),
              region: clean("region", 40),
              telehealth: Boolean(body.telehealth),
              credentials: clean("credentials", 80),
              agesServed: clean("agesServed", 40),
              blurb: clean("blurb", 500),
              phone: clean("phone", 40) || me.phone,
              takingClients: Boolean(body.takingClients),
              availableAt: new Date(),
            }
          : {}),
      },
    });
    return NextResponse.json({ ok: true, listed });
  }

  // ── "am I still taking clients?" — the one field that rots ────────────────
  if (op === "setAvailability") {
    const me = await getCurrentTeacher();
    if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    await prisma.specialistTeacher.update({
      where: { id: me.id },
      data: { takingClients: Boolean(body.takingClients), availableAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // ── the therapist withdraws ───────────────────────────────────────────────
  if (op === "unlist") {
    const me = await getCurrentTeacher();
    if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    await prisma.specialistTeacher.update({
      where: { id: me.id },
      data: { listed: false, listedAskedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
