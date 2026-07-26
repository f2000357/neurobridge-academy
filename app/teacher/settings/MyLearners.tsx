"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type MyLearner = {
  childId: string;
  name: string;
  username: string | null;
  role: "primary_guide" | "guide";
  expiresAt: string | null;
};

const day = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
};

// The children this guide handles, and the door out. Nobody should have to ask
// permission to stop working with a family — but the primary guide has to hand
// that role over first, so a learner is never left without one.
export default function MyLearners({ learners }: { learners: MyLearner[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function stepAway(l: MyLearner) {
    if (
      !confirm(
        `Stop managing ${l.name}?\n\nYou'll lose access immediately. Their primary guide, another guide, or a centre admin can add you back.`
      )
    )
      return;
    setBusy(l.childId);
    setNote(null);
    const r = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "selfOffboard", childId: l.childId }),
    });
    const data = await r.json();
    setBusy(null);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setNote(
      data.freedBlocks
        ? `You've stepped away from ${l.name}. ${data.freedBlocks} upcoming block(s) you held now need cover.`
        : `You've stepped away from ${l.name}.`
    );
    router.refresh();
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2>Learners you handle</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
        You can step away from any learner at any time. If you&apos;re their primary guide, hand that
        role to another guide first — from the learner&apos;s <strong>People</strong> section.
      </p>

      {note && (
        <p className="muted" role="status" style={{ fontSize: "0.85rem" }}>
          {note}
        </p>
      )}

      {learners.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          You don&apos;t manage any learners right now.
        </p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {learners.map((l) => (
            <div key={l.childId} className="row doc-row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span>
                <strong>{l.name}</strong>
                <span className={`pill ${l.role === "primary_guide" ? "good" : ""}`} style={{ marginLeft: 8 }}>
                  {l.role === "primary_guide" ? "primary guide" : "guide"}
                </span>
                {l.expiresAt && (
                  <span className="pill warn" style={{ marginLeft: 6 }}>
                    until {day(l.expiresAt)}
                  </span>
                )}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <Link className="chip" href={`/teacher/admin/${l.childId}`}>
                  Open
                </Link>
                {l.role === "primary_guide" ? (
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    hand over first
                  </span>
                ) : (
                  <button
                    className="chip danger"
                    onClick={() => stepAway(l)}
                    disabled={busy === l.childId}
                  >
                    {busy === l.childId ? "…" : "Step away"}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
