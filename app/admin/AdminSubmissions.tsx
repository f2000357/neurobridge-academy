"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  standardCode: string;
  author: string;
  center: string;
};

export default function AdminSubmissions({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="muted">Nothing waiting — the global shelf is up to date.</p>;
  }

  async function promote(id: string) {
    setBusy(id);
    await fetch("/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "promote", planId: id }),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="roster">
      {items.map((it) => (
        <div key={it.id} className="roster-row" style={{ gridTemplateColumns: "2fr 1fr auto" }}>
          <div className="roster-id">
            <span className="roster-name">{it.title}</span>
            <span className="roster-sub">
              {it.subject}
              {it.gradeLevel ? ` · Gr ${it.gradeLevel}` : ""}
              {it.standardCode ? ` · ${it.standardCode}` : ""}
            </span>
          </div>
          <span className="roster-sub">
            {it.author} · {it.center}
          </span>
          <button className="btn" disabled={busy === it.id} onClick={() => promote(it.id)}>
            {busy === it.id ? "Promoting…" : "Promote to global"}
          </button>
        </div>
      ))}
    </div>
  );
}
