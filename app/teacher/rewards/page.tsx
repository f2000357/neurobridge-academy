import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RewardsManager from "./RewardsManager";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const teacher = await getCurrentUser({
    include: {
      children: { orderBy: { name: "asc" } },
      rewards: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!teacher || teacher.children.length === 0) {
    return (
      <main className="page wrap">
        <h1>No students yet</h1>
        <p className="muted">
          <Link href="/teacher">Back to console</Link>
        </p>
      </main>
    );
  }

  // Recent redemptions across all children, for the activity feed.
  const redemptions = await prisma.redemption.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { child: { select: { name: true } } },
  });

  return (
    <RewardsManager
      childrenList={teacher.children.map((c) => ({
        id: c.id,
        name: c.name,
        balance: c.points - c.pointsSpent,
      }))}
      rewards={teacher.rewards.map((r) => ({
        id: r.id,
        name: r.name,
        cost: r.cost,
        emoji: r.emoji,
        active: r.active,
      }))}
      recent={redemptions.map((r) => ({
        id: r.id,
        childName: r.child.name,
        rewardName: r.rewardName,
        emoji: r.emoji,
        cost: r.cost,
        when: r.createdAt.toISOString(),
      }))}
    />
  );
}
