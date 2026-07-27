import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RewardsManager from "./RewardsManager";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";
import { guideIdsForChildren } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const teacher = await getCurrentUser();

  // The learners this guide WORKS WITH, not the ones they happen to own.
  // `user.children` is Child.teacherId — a single owner — so a second guide
  // invited onto a child owned by someone else saw "No students yet" and had no
  // way to set or award a prize. Access is what should decide, everywhere.
  const kids = teacher ? await rosterChildren(teacher) : [];

  if (!teacher || kids.length === 0) {
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
  // The shared shelf: prizes added by anyone who guides these children.
  const rewards = await prisma.reward.findMany({
    where: {
      OR: [
        { childId: { in: kids.map((c) => c.id) } },
        { childId: null, teacherId: { in: await guideIdsForChildren(kids.map((c) => c.id)) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Scoped to this guide's own learners. It used to read every redemption on
  // the platform, which showed one family another family's children.
  const redemptions = await prisma.redemption.findMany({
    where: { childId: { in: kids.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { child: { select: { name: true } } },
  });

  return (
    <RewardsManager
      childrenList={kids.map((c) => ({
        id: c.id,
        name: c.name,
        balance: c.points - c.pointsSpent,
      }))}
      rewards={rewards.map((r) => ({
        childId: r.childId,
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
