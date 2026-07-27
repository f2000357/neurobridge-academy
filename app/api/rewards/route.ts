import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardOperate, currentOperator } from "@/lib/authz";

// A guide may only touch a prize they own (or NeuroBridge admin, for support).
async function ownsReward(rewardId: string): Promise<boolean> {
  const [me, reward] = await Promise.all([
    currentOperator(),
    prisma.reward.findUnique({ where: { id: rewardId }, select: { teacherId: true } }),
  ]);
  if (!me || !reward) return false;
  if (me.role === "neurable_admin" || reward.teacherId === me.id) return true;

  // A guide who shares a child with the owner shares the shelf. Anything less
  // means the person who typed the prize in is the only one who can fix a typo.
  const mine = await prisma.childAccess.findMany({
    where: { userId: me.id },
    select: { childId: true },
  });
  if (mine.length === 0) return false;
  const theirs = await prisma.childAccess.findFirst({
    where: { userId: reward.teacherId, childId: { in: mine.map((c) => c.childId) } },
    select: { id: true },
  });
  if (theirs) return true;
  // Or the owner is the child's own account holder.
  const owned = await prisma.child.findFirst({
    where: { teacherId: reward.teacherId, id: { in: mine.map((c) => c.childId) } },
    select: { id: true },
  });
  return Boolean(owned);
}

// Prizes the guide offers + guide-assisted redemptions.
// Spendable balance = child.points (lifetime earned) − child.pointsSpent.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "addReward") {
    const { name, cost, emoji } = body as { name: string; cost: number; emoji?: string };
    if (!name?.trim() || !Number.isFinite(cost) || cost <= 0) {
      return NextResponse.json({ error: "Give the prize a name and a point cost above 0." }, { status: 400 });
    }
    const teacher = await getCurrentUser();
    if (!teacher) return NextResponse.json({ error: "no teacher" }, { status: 404 });
    const reward = await prisma.reward.create({
      data: { teacherId: teacher.id, name: name.trim(), cost: Math.round(cost), emoji: emoji?.trim() || "🎁" },
    });
    return NextResponse.json({ ok: true, reward });
  }

  if (op === "updateReward") {
    const { id, name, cost, emoji, active } = body as {
      id: string;
      name?: string;
      cost?: number;
      emoji?: string;
      active?: boolean;
    };
    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (Number.isFinite(cost) && (cost as number) > 0) data.cost = Math.round(cost as number);
    if (typeof emoji === "string" && emoji.trim()) data.emoji = emoji.trim();
    if (typeof active === "boolean") data.active = active;
    if (!(await ownsReward(id))) return NextResponse.json({ error: "not your prize" }, { status: 403 });
    const reward = await prisma.reward.update({ where: { id }, data });
    return NextResponse.json({ ok: true, reward });
  }

  if (op === "removeReward") {
    const { id } = body as { id: string };
    if (!(await ownsReward(id))) return NextResponse.json({ error: "not your prize" }, { status: 403 });
    // Keep past redemptions (rewardId set null via schema); just drop the catalog item.
    await prisma.reward.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  if (op === "redeem") {
    const { childId, rewardId } = body as { childId: string; rewardId: string };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    const child = await prisma.child.findUnique({ where: { id: childId } });
    const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
    if (!child || !reward) return NextResponse.json({ error: "not found" }, { status: 404 });
    const balance = child.points - child.pointsSpent;
    if (reward.cost > balance) {
      return NextResponse.json(
        { error: `Not enough points yet — ${child.name} has ${balance}, needs ${reward.cost}.` },
        { status: 400 }
      );
    }
    const redemption = await prisma.redemption.create({
      data: {
        childId,
        rewardId: reward.id,
        rewardName: reward.name,
        emoji: reward.emoji,
        cost: reward.cost,
      },
    });
    await prisma.child.update({ where: { id: childId }, data: { pointsSpent: { increment: reward.cost } } });
    return NextResponse.json({ ok: true, redemption, balance: balance - reward.cost });
  }

  if (op === "undoRedeem") {
    // Guide correction: reverse a redemption and hand the points back.
    const { id } = body as { id: string };
    const r = await prisma.redemption.findUnique({ where: { id } });
    if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
    const denied = await guardOperate(r.childId);
    if (denied) return denied;
    await prisma.redemption.delete({ where: { id } });
    await prisma.child.update({
      where: { id: r.childId },
      data: { pointsSpent: { decrement: r.cost } },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
