"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CheckItem = {
  id: string;
  childName: string;
  title: string;
  provider: string;
  practiceUrl: string;
};

const providerLabel = (p: string) => (p === "khan" ? "Khan Academy" : p === "ixl" ? "IXL" : "the provider");
const coinsFor = (acc: string) => {
  const n = Number(acc);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.floor(n / 10)));
};

// The guide opens the child's work on the provider, reads the accuracy, enters
// it — coins = floor(accuracy / 10). Or rejects if nothing was really done.
export default function ValidationList({ items }: { items: CheckItem[] }) {
  const router = useRouter();
  const [acc, setAcc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function call(op: string, id: string, accuracy?: number) {
    setBusy(id);
    await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, id, accuracy }),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map((it) => {
        const coins = coinsFor(acc[it.id] ?? "");
        return (
          <div key={it.id} className="validate-row">
            <span className="v-main">
              <span className="v-name">{it.childName}</span>
              <span className="muted"> · {it.title} · {providerLabel(it.provider)}</span>
            </span>
            {it.practiceUrl && (
              <a className="chip" href={it.practiceUrl} target="_blank" rel="noreferrer">
                Open the work →
              </a>
            )}
            <input
              className="field v-acc"
              inputMode="numeric"
              placeholder="acc %"
              aria-label={`Accuracy for ${it.childName}`}
              value={acc[it.id] ?? ""}
              onChange={(e) => setAcc((a) => ({ ...a, [it.id]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
            />
            <span className="v-coins">{coins == null ? "" : `${coins} ⭐`}</span>
            <button
              className="chip approve"
              disabled={busy === it.id || coins == null}
              onClick={() => call("confirm", it.id, Number(acc[it.id]))}
            >
              ✓ Confirm
            </button>
            <button
              className="chip danger"
              disabled={busy === it.id}
              onClick={() => call("reject", it.id)}
            >
              Not done
            </button>
          </div>
        );
      })}
    </div>
  );
}
