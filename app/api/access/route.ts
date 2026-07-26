import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOperator, can, guardCan } from "@/lib/authz";
import { getCurrentUser } from "@/lib/auth";
import { grantAccess, revokeAccess, transferPrimary, roleOnChild, liveGuideCount } from "@/lib/access";
import { audit, AUDIT } from "@/lib/audit";
import { todayStr } from "@/lib/time";

// Managing who may act on a learner.
//
// Inviting, removing and handing over the primary role need "manage_access" —
// the primary guide, a centre admin, or a NeuroBridge admin. Stepping away from a
// learner yourself needs nothing beyond already having access, because nobody
// should have to ask permission to stop working with a family.

/**
 * When someone stops managing a child, any upcoming blocks they were holding
 * become unassigned — the block survives and reads as "the guide runs it" — and we
 * report how many, so the primary guide can be told what now needs cover.
 */
async function releaseUpcomingBlocks(childId: string, userId: string): Promise<number> {
  // ScheduleSlot.teacherId points at a SpecialistTeacher, not a User, so a guide
  // leaving frees nothing there. Kept for when a departing person also holds
  // specialist blocks under the same identity.
  const res = await prisma.scheduleSlot.updateMany({
    where: { childId, teacherId: userId, date: { gte: todayStr() } },
    data: { teacherId: null },
  });
  return res.count;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op, childId } = body as { op: string; childId: string };
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!childId) return NextResponse.json({ error: "no learner specified" }, { status: 400 });

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, name: true },
  });
  if (!child) return NextResponse.json({ error: "learner not found" }, { status: 404 });

  // ── invite someone ────────────────────────────────────────────────────────
  if (op === "invite") {
    const denied = await guardCan(childId, "manage_access");
    if (denied) return denied;

    const email = String(body.email ?? "").trim().toLowerCase();
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
    if (!email) return NextResponse.json({ error: "Enter their email address." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (!user) {
      return NextResponse.json(
        {
          error:
            "No account with that email yet. They need an account first — a centre admin or NeuroBridge admin can create one.",
        },
        { status: 404 }
      );
    }
    if (user.id === me.id) {
      return NextResponse.json({ error: "You already have access." }, { status: 400 });
    }

    await grantAccess({ childId, userId: user.id, role: "guide", expiresAt, invitedById: me.id });
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.accessGranted,
      childId,
      detail: `${user.name} can now manage ${child.name}${expiresAt ? ` until ${String(body.expiresAt)}` : ""}`,
      after: expiresAt ? `guide until ${String(body.expiresAt)}` : "guide",
    });
    return NextResponse.json({ ok: true, name: user.name });
  }

  // ── remove someone else ───────────────────────────────────────────────────
  if (op === "remove") {
    const denied = await guardCan(childId, "manage_access");
    if (denied) return denied;

    const userId = String(body.userId ?? "");
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const res = await revokeAccess({ childId, userId });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });

    const freed = await releaseUpcomingBlocks(childId, userId);
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.accessRevoked,
      childId,
      detail: `${target?.name ?? "Someone"} no longer manages ${child.name}`,
      before: "guide",
      after: "no access",
    });
    return NextResponse.json({ ok: true, freedBlocks: freed });
  }

  // ── step away yourself ────────────────────────────────────────────────────
  if (op === "selfOffboard") {
    const role = await roleOnChild(me.id, childId);
    if (!role) return NextResponse.json({ error: "You don't manage this learner." }, { status: 400 });
    if (role === "primary_guide") {
      return NextResponse.json(
        {
          error:
            "You're the primary guide. Hand that role to another guide first — a learner can't be left without one.",
        },
        { status: 400 }
      );
    }
    if ((await liveGuideCount(childId)) <= 1) {
      return NextResponse.json(
        { error: "You're this learner's last guide — someone has to stay." },
        { status: 400 }
      );
    }

    const res = await revokeAccess({ childId, userId: me.id });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });

    const freed = await releaseUpcomingBlocks(childId, me.id);
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.accessSelfOffboard,
      childId,
      detail: `${me.name} stepped away from ${child.name}`,
      before: "guide",
      after: "no access",
    });
    return NextResponse.json({ ok: true, freedBlocks: freed });
  }

  // ── hand over the primary role ────────────────────────────────────────────
  if (op === "transferPrimary") {
    const denied = await guardCan(childId, "manage_access");
    if (denied) return denied;

    const toUserId = String(body.userId ?? "");
    const to = await prisma.user.findUnique({ where: { id: toUserId }, select: { name: true } });
    // A centre/NeuroBridge admin may transfer without being the primary themselves,
    // so hand over from whoever currently holds it.
    const currentPrimary = await prisma.childAccess.findFirst({
      where: { childId, role: "primary_guide" },
      select: { userId: true },
    });
    if (!currentPrimary) {
      return NextResponse.json({ error: "This learner has no primary guide to transfer from." }, { status: 400 });
    }
    const res = await transferPrimary({ childId, fromUserId: currentPrimary.userId, toUserId });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });

    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.primaryTransferred,
      childId,
      detail: `${to?.name ?? "Someone"} is now the primary guide for ${child.name}`,
      after: to?.name ?? "",
    });
    return NextResponse.json({ ok: true });
  }

  // ── change an existing person's role / expiry ──────────────────────────────
  if (op === "setRole") {
    const denied = await guardCan(childId, "manage_access");
    if (denied) return denied;
    const userId = String(body.userId ?? "");
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
    const row = await prisma.childAccess.findUnique({
      where: { childId_userId: { childId, userId } },
    });
    if (!row) return NextResponse.json({ error: "They don't have access." }, { status: 404 });
    if (row.role === "primary_guide") {
      return NextResponse.json(
        { error: "Transfer the primary role instead of editing it." },
        { status: 400 }
      );
    }
    await prisma.childAccess.update({ where: { id: row.id }, data: { expiresAt } });
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.accessGranted,
      childId,
      detail: expiresAt ? `access now lapses ${String(body.expiresAt)}` : "access no longer lapses",
      before: row.expiresAt ? row.expiresAt.toISOString().slice(0, 10) : "open-ended",
      after: expiresAt ? String(body.expiresAt) : "open-ended",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
