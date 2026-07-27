import Link from "next/link";
import { prisma } from "@/lib/prisma";
import KidLock from "../KidLock";
import { guideIdsForChild } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export default async function KidPrizes({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId: handle } = await params;
  const child = await prisma.child.findFirst({
    where: { OR: [{ username: handle }, { id: handle }] },
  });
  if (!child) {
    return (
      <main className="page wrap">
        <h1>Hmm, we couldn&apos;t find you</h1>
        <p className="muted">
          <Link href="/">Go back to the front door</Link>
        </p>
      </main>
    );
  }
  const linkHandle = child.username ?? child.id;
  const balance = child.points - child.pointsSpent;

  // Every guide's prizes, not just the owner's — the shelf belongs to the
  // child, and shouldn't change depending on which adult set it up.
  const guideIds = await guideIdsForChild(child.id);
  const rewards = await prisma.reward.findMany({
    where: {
      active: true,
      OR: [
        { childId: child.id },
        // Rows from before the shelf was per-child, still shared by guide.
        { childId: null, teacherId: { in: guideIds } },
      ],
    },
    orderBy: { cost: "asc" },
  });

  return (
    <>
      <header className="topbar kidbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            Prize corner
          </span>
          <KidLock />
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 640 }}>
        <p className="eyebrow">Your stars</p>
        <h1>You have ⭐ {balance} to spend</h1>
        <p className="muted">
          Here are the prizes you can work toward. When you have enough, ask your guide and they&apos;ll
          help you redeem it. 🎉
        </p>

        {rewards.length === 0 ? (
          <p className="muted" style={{ marginTop: 20 }}>
            No prizes yet — check back soon!
          </p>
        ) : (
          <div className="prize-grid" style={{ marginTop: 20 }}>
            {rewards.map((r) => {
              const afford = balance >= r.cost;
              const pct = Math.min(100, Math.round((balance / r.cost) * 100));
              return (
                <div key={r.id} className={`prize-card ${afford ? "ready" : ""}`}>
                  <span className="prize-emoji" aria-hidden="true">
                    {r.emoji}
                  </span>
                  <span className="prize-name">{r.name}</span>
                  <span className="prize-cost">⭐ {r.cost}</span>
                  {afford ? (
                    <span className="pill good">Ready! Ask your guide</span>
                  ) : (
                    <>
                      <div className="prize-progress" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className="muted" style={{ fontSize: "0.8rem" }}>
                        {r.cost - balance} more to go
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="muted" style={{ marginTop: 24 }}>
          <Link href={`/student/${linkHandle}`}>← Back to my day</Link>
        </p>
      </main>
    </>
  );
}
