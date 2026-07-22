"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type ApprovalItem = {
  key: string;
  kind: "lesson" | "week";
  proposedLessonId?: string;
  href: string;
  icon: string;
  title: string;
  sub: string;
  cta: string;
};

export default function ApprovalRow({ item }: { item: ApprovalItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (gone) return null;

  async function act(op: "approveLesson" | "rejectLesson") {
    setBusy(op === "approveLesson" ? "approve" : "reject");
    setErr(null);
    try {
      const res = await fetch("/api/child", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, proposedLessonId: item.proposedLessonId }),
      });
      const data = await res.json();
      if (data.ok) {
        setGone(true);
        router.refresh();
      } else {
        setBusy(null);
        setErr(data.error || "Couldn't do that — try again.");
      }
    } catch {
      setBusy(null);
      setErr("Couldn't reach the server.");
    }
  }

  return (
    <div className="approval-row">
      <span className="approval-icon" aria-hidden="true">
        {item.icon}
      </span>
      <Link href={item.href} className="approval-main">
        <strong>{item.title}</strong>
        <span className="muted">{err ?? item.sub}</span>
      </Link>
      {item.kind === "lesson" ? (
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <button className="chip approve" onClick={() => act("approveLesson")} disabled={busy !== null}>
            {busy === "approve" ? "Approving…" : "✓ Approve"}
          </button>
          <button className="chip danger" onClick={() => act("rejectLesson")} disabled={busy !== null}>
            {busy === "reject" ? "…" : "Reject"}
          </button>
        </div>
      ) : (
        <Link href={item.href} className="approval-go">
          {item.cta}
        </Link>
      )}
    </div>
  );
}
