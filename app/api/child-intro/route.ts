import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardEditIntro } from "@/lib/authz";
import { audit, AUDIT } from "@/lib/audit";

// The child's introduction: their picture, and the few sentences the parent
// writes for every adult who works with them.
//
// Every op here is gated on `guardEditIntro` — the PRIMARY guardian alone. That
// is stricter than the rest of the app on purpose: other guides, centre admins,
// and NeuroBridge admins can all read this and none of them can rewrite it. It
// is the parent's voice describing their own child.

// Base64 inflates by ~4/3, so this lands near 1.5MB of actual image. The client
// downsizes to 512px before sending, which puts a normal photo far under it;
// this is the backstop for anything that skips the browser.
const MAX_BASE64 = 2_000_000;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Trim, collapse runaway whitespace, and cap length. */
function clean(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op, childId } = body as { op: string; childId: string };
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!childId) return NextResponse.json({ error: "No learner specified." }, { status: 400 });

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, name: true },
  });
  if (!child) return NextResponse.json({ error: "Learner not found." }, { status: 404 });

  // ── the written introduction ──────────────────────────────────────────────
  if (op === "saveIntro") {
    const denied = await guardEditIntro(childId);
    if (denied) return denied;

    const aboutMe = clean(body.aboutMe, 1500);
    const likes = clean(body.likes, 800);
    const dislikes = clean(body.dislikes, 800);

    // The profile row may not exist yet for a child created before this feature.
    await prisma.childProfile.upsert({
      where: { childId },
      create: { childId, aboutMe, likes, dislikes, introUpdatedAt: new Date() },
      update: { aboutMe, likes, dislikes, introUpdatedAt: new Date() },
    });

    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.profileUpdated,
      childId,
      detail: `updated ${child.name}'s introduction`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── the picture ───────────────────────────────────────────────────────────
  if (op === "uploadPhoto") {
    const denied = await guardEditIntro(childId);
    if (denied) return denied;

    const mimeType = String(body.mimeType ?? "");
    const data = String(body.data ?? "");

    if (!ALLOWED.includes(mimeType)) {
      return NextResponse.json(
        { error: "That file isn't an image we can show. Use a JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }
    if (!data) return NextResponse.json({ error: "No image was sent." }, { status: 400 });
    if (data.length > MAX_BASE64) {
      return NextResponse.json(
        { error: "That picture is too large. Try one under about 1.5MB." },
        { status: 413 }
      );
    }

    await prisma.childPhoto.upsert({
      where: { childId },
      create: { childId, mimeType, data },
      update: { mimeType, data },
    });

    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.profileUpdated,
      childId,
      detail: `updated ${child.name}'s picture`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── where they live, who to call ──────────────────────────────────────────
  // The most sensitive record we hold: a child's home address and their doctor.
  // Same gate as the rest of the profile — the primary guardian alone.
  if (op === "saveContact") {
    const denied = await guardEditIntro(childId);
    if (denied) return denied;

    const f = (k: string, max = 120) => clean((body as Record<string, unknown>)[k], max);
    const data = {
      addressLine1: f("addressLine1"),
      addressLine2: f("addressLine2"),
      city: f("city", 80),
      region: f("region", 80),
      postalCode: f("postalCode", 20),
      emergencyName: f("emergencyName", 80),
      emergencyRelation: f("emergencyRelation", 60),
      emergencyPhone: f("emergencyPhone", 40),
      emergencyAltPhone: f("emergencyAltPhone", 40),
      doctorName: f("doctorName", 80),
      doctorPractice: f("doctorPractice", 120),
      doctorPhone: f("doctorPhone", 40),
      urgentNotes: f("urgentNotes", 600),
    };

    await prisma.childContact.upsert({
      where: { childId },
      create: { childId, ...data },
      update: data,
    });

    // Logged as a profile change, but WITHOUT the values — an audit trail that
    // repeated a home address would defeat the point of guarding it.
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.profileUpdated,
      childId,
      detail: `updated ${child.name}'s address and contacts`,
    });
    return NextResponse.json({ ok: true });
  }

  if (op === "removePhoto") {
    const denied = await guardEditIntro(childId);
    if (denied) return denied;

    await prisma.childPhoto.deleteMany({ where: { childId } });
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.profileUpdated,
      childId,
      detail: `removed ${child.name}'s picture`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
