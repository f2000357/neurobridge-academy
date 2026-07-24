import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardSession, guardOperate } from "@/lib/authz";
import { todayStr } from "@/lib/time";

// Guide validation of provider (IXL/Khan) work done off-platform.
// The child marks a provider lesson done; the guide opens the work, reads the
// accuracy, and confirms — coins = floor(accuracy/10), 0-10. Native points only.

export function coinsForAccuracy(accuracy: number): number {
  if (!Number.isFinite(accuracy)) return 0;
  return Math.max(0, Math.min(10, Math.floor(accuracy / 10)));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // The child finished a provider lesson and came back to mark it done.
  if (op === "submit") {
    const { childId, slotId, title, provider, practiceUrl } = body as {
      childId: string;
      slotId?: string;
      title?: string;
      provider?: string;
      practiceUrl?: string;
    };
    const denied = await guardSession(childId);
    if (denied) return denied;
    // Don't stack duplicates for the same slot while one is still pending.
    if (slotId) {
      const open = await prisma.providerCompletion.findFirst({
        where: { childId, slotId, status: "pending" },
      });
      if (open) return NextResponse.json({ ok: true, id: open.id, pending: true });
    }
    const c = await prisma.providerCompletion.create({
      data: {
        childId,
        slotId: slotId || null,
        title: title || "Practice",
        provider: provider || "",
        practiceUrl: practiceUrl || "",
      },
    });
    return NextResponse.json({ ok: true, id: c.id, pending: true });
  }

  // Guide checked the work: award coins from the accuracy they read.
  if (op === "confirm") {
    const { id, accuracy } = body as { id: string; accuracy: number };
    const c = await prisma.providerCompletion.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    const denied = await guardOperate(c.childId);
    if (denied) return denied;

    const acc = Math.max(0, Math.min(100, Math.round(Number(accuracy))));
    const coins = coinsForAccuracy(acc);

    // Reverse any prior award (re-validating with a new accuracy).
    if (c.pointEventId) {
      await prisma.pointEvent.deleteMany({ where: { id: c.pointEventId } });
      if (c.coins) await prisma.child.update({ where: { id: c.childId }, data: { points: { decrement: c.coins } } });
    }

    let pointEventId: string | null = null;
    if (coins > 0) {
      const pe = await prisma.pointEvent.create({
        data: { childId: c.childId, points: coins, kind: "provider", date: todayStr() },
      });
      pointEventId = pe.id;
      await prisma.child.update({ where: { id: c.childId }, data: { points: { increment: coins } } });
    }
    await prisma.providerCompletion.update({
      where: { id },
      data: { accuracy: acc, coins, status: "validated", pointEventId, validatedAt: new Date() },
    });
    return NextResponse.json({ ok: true, coins, accuracy: acc });
  }

  // Guide rejects / undoes a completion (nothing done, or a mistaken validation).
  if (op === "reject") {
    const { id } = body as { id: string };
    const c = await prisma.providerCompletion.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    const denied = await guardOperate(c.childId);
    if (denied) return denied;
    if (c.pointEventId) {
      await prisma.pointEvent.deleteMany({ where: { id: c.pointEventId } });
      if (c.coins) await prisma.child.update({ where: { id: c.childId }, data: { points: { decrement: c.coins } } });
    }
    await prisma.providerCompletion.update({
      where: { id },
      data: { status: "rejected", coins: 0, pointEventId: null },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
