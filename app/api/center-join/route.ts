import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardPrimaryGuide, currentOperator } from "@/lib/authz";
import { audit, AUDIT } from "@/lib/audit";

// Joining and leaving a centre.
//
// Parent-driven end to end. The family asks; the centre answers. Nothing here
// lets a centre pull a child in, and nothing lets NeuroBridge place one — the
// two ops that change a child's membership are gated on the primary guardian
// (request, leave) and on the centre (approve, decline) respectively.
//
// Membership itself lives on Child.centerId, which everything else already
// reads. This table records the asking, so a family and a centre can both see
// what was decided and when.

/** The centre admin (or a NeuroBridge admin) who may answer for this centre. */
async function guardCenterStaff(centerId: string): Promise<NextResponse | null> {
  const me = await currentOperator();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (me.role === "neurable_admin") return null;
  if (me.role === "center_admin" && me.centerId === centerId) return null;
  return NextResponse.json({ error: "That isn't your centre." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // ── the family asks ───────────────────────────────────────────────────────
  if (op === "request") {
    const childId = String(body.childId ?? "");
    const centerId = String(body.centerId ?? "");
    const message = String(body.message ?? "").trim().slice(0, 600);

    const denied = await guardPrimaryGuide(childId, "ask to join a centre");
    if (denied) return denied;

    const [child, center] = await Promise.all([
      prisma.child.findUnique({ where: { id: childId }, select: { name: true, centerId: true } }),
      prisma.center.findUnique({ where: { id: centerId }, select: { name: true } }),
    ]);
    if (!child) return NextResponse.json({ error: "Learner not found." }, { status: 404 });
    if (!center) return NextResponse.json({ error: "That centre no longer exists." }, { status: 404 });
    if (child.centerId) {
      return NextResponse.json(
        { error: "This learner is already in a centre. Leave that one first." },
        { status: 400 }
      );
    }

    // One live request at a time — a queue of duplicates helps nobody.
    const existing = await prisma.centerJoinRequest.findFirst({
      where: { childId, status: "pending" },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already have a request waiting. Withdraw it to ask a different centre." },
        { status: 400 }
      );
    }

    await prisma.centerJoinRequest.create({
      data: {
        childId,
        centerId,
        message,
        requestedById: me.id,
        requestedByName: me.name,
      },
    });
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.centerRequested,
      childId,
      detail: `asked to join ${center.name}`,
      after: "pending",
    });
    return NextResponse.json({ ok: true, center: center.name });
  }

  // ── the family changes its mind ───────────────────────────────────────────
  if (op === "withdraw") {
    const requestId = String(body.requestId ?? "");
    const row = await prisma.centerJoinRequest.findUnique({
      where: { id: requestId },
      include: { center: { select: { name: true } } },
    });
    if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 });

    const denied = await guardPrimaryGuide(row.childId, "withdraw a request");
    if (denied) return denied;
    if (row.status !== "pending") {
      return NextResponse.json({ error: "That request has already been answered." }, { status: 400 });
    }

    await prisma.centerJoinRequest.update({
      where: { id: requestId },
      data: { status: "withdrawn", decidedAt: new Date(), decidedByName: me.name },
    });
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.centerRequested,
      childId: row.childId,
      detail: `withdrew the request to join ${row.center.name}`,
      before: "pending",
      after: "withdrawn",
    });
    return NextResponse.json({ ok: true });
  }

  // ── the family leaves ─────────────────────────────────────────────────────
  if (op === "leave") {
    const childId = String(body.childId ?? "");
    const denied = await guardPrimaryGuide(childId, "leave a centre");
    if (denied) return denied;

    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: { name: true, centerId: true, center: { select: { name: true } } },
    });
    if (!child?.centerId) {
      return NextResponse.json({ error: "This learner isn't in a centre." }, { status: 400 });
    }

    // The child's own records are keyed to childId and are untouched. What goes
    // is the centre's shared library and the centre admin's view of them, both
    // of which follow centerId — so clearing the field is the whole operation.
    await prisma.child.update({ where: { id: childId }, data: { centerId: null } });
    await audit({
      actorId: me.id,
      actorName: me.name,
      action: AUDIT.centerLeft,
      childId,
      detail: `left ${child.center?.name ?? "the centre"}`,
      before: child.center?.name ?? "",
      after: "independent",
    });
    return NextResponse.json({ ok: true });
  }

  // ── the centre answers ────────────────────────────────────────────────────
  if (op === "decide") {
    const requestId = String(body.requestId ?? "");
    const approve = Boolean(body.approve);
    const note = String(body.note ?? "").trim().slice(0, 400);

    const row = await prisma.centerJoinRequest.findUnique({
      where: { id: requestId },
      include: { center: { select: { name: true } }, child: { select: { name: true, centerId: true } } },
    });
    if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 });

    const denied = await guardCenterStaff(row.centerId);
    if (denied) return denied;
    if (row.status !== "pending") {
      return NextResponse.json({ error: "That request has already been answered." }, { status: 400 });
    }
    if (approve && row.child.centerId) {
      return NextResponse.json(
        { error: "That learner has since joined another centre." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.centerJoinRequest.update({
        where: { id: requestId },
        data: {
          status: approve ? "approved" : "declined",
          decidedAt: new Date(),
          decidedByName: me.name,
          decidedNote: note,
        },
      });
      if (approve) {
        await tx.child.update({ where: { id: row.childId }, data: { centerId: row.centerId } });
      }
    });

    await audit({
      actorId: me.id,
      actorName: me.name,
      action: approve ? AUDIT.centerJoined : AUDIT.centerDeclined,
      childId: row.childId,
      detail: approve
        ? `${row.child.name} joined ${row.center.name}`
        : `${row.center.name} declined ${row.child.name}`,
      before: "pending",
      after: approve ? "member" : "declined",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
