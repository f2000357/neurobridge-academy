import Link from "next/link";
import { prisma } from "@/lib/prisma";
import TestFlow from "./TestFlow";

export const dynamic = "force-dynamic";

export default async function TestPage({
  params,
}: {
  params: Promise<{ childId: string; slotId: string }>;
}) {
  const { childId: handle, slotId } = await params;
  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: slotId },
    include: { child: true },
  });
  const matches = slot && (slot.child.username === handle || slot.childId === handle);
  if (!slot || !matches || slot.kind !== "testing") {
    return (
      <main className="page wrap">
        <h1>No check-in here</h1>
        <p className="muted">
          <Link href={`/student/${handle}`}>← Back to my day</Link>
        </p>
      </main>
    );
  }
  const linkHandle = slot.child.username ?? slot.childId;

  return (
    <TestFlow
      childId={slot.childId}
      childName={slot.child.name}
      slotId={slot.id}
      dayHref={`/student/${linkHandle}`}
    />
  );
}
