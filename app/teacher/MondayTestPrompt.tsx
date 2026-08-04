"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "If they don't take it Friday, they take it Monday morning."
//
// This used to happen by itself, written into the schedule the moment the CHILD
// opened their day — which meant a guide could delete Monday's check-in, the
// child would open their day, and it came straight back. The delete looked
// broken; what was really happening is that a page view was recreating it.
//
// Same rule, asked rather than assumed. Dismissing is a real answer: it lasts
// as long as this visit, and the check-in stays gone until you say otherwise.
export default function MondayTestPrompt({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (gone) return null;

  async function place() {
    setBusy(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "placeMondayTest", childId }),
    });
    setBusy(false);
    setGone(true);
    router.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <p style={{ margin: 0 }}>
        <strong>{childName} didn&apos;t do Friday&apos;s check-in.</strong>
      </p>
      <p className="muted" style={{ margin: "4px 0 10px", fontSize: "0.9rem" }}>
        It can go into this morning instead — or leave it, and the week carries on without it.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={place} disabled={busy}>
          {busy ? "Adding…" : "Put it on this morning"}
        </button>
        <button className="chip" onClick={() => setGone(true)} disabled={busy}>
          Skip it
        </button>
      </div>
    </div>
  );
}
