"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type Shared = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  topic: string;
  standardCode: string;
  durationMin: number;
  scope: string; // center | global
  author: string;
  center: string;
};

type Tab = "all" | "center" | "global";

export default function BrowseView({ shared }: { shared: Shared[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return shared.filter((s) => {
      if (tab !== "all" && s.scope !== tab) return false;
      if (!needle) return true;
      return [s.title, s.subject, s.topic, s.standardCode].join(" ").toLowerCase().includes(needle);
    });
  }, [shared, tab, q]);

  async function addCopy(id: string) {
    setBusy(id);
    const res = await fetch("/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "copyToMe", planId: id }),
    });
    const data = await res.json();
    setBusy(null);
    if (data.ok) {
      setAdded((a) => ({ ...a, [id]: true }));
      router.refresh();
    }
  }

  return (
    <div>
      <p className="eyebrow">Shared library</p>
      <h1>Browse &amp; add lessons</h1>
      <p className="muted">
        Lessons shared across your center and the NeuroBridge global shelf. Add a copy to tailor it for
        your own learners — the original stays untouched.
      </p>

      <div className="dash-bar" style={{ marginTop: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
        {(["all", "center", "global"] as Tab[]).map((t) => (
          <button key={t} className={`chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "all" ? "All" : t === "center" ? "My center" : "Global"}
          </button>
        ))}
        <input
          className="field"
          style={{ marginLeft: "auto", maxWidth: 240 }}
          placeholder="Search subject, topic, standard…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <p className="muted" style={{ marginTop: 20 }}>
          Nothing shared here yet.
        </p>
      ) : (
        <div className="lib-grid" style={{ marginTop: 18 }}>
          {list.map((s) => (
            <div key={s.id} className="lib-card">
              <div className="lib-row">
                <span className="lib-subject">{s.subject}</span>
                {s.standardCode && <span className="lib-code">{s.standardCode}</span>}
              </div>
              <strong className="lib-title">
                {s.title}
                <span className={`vis-badge ${s.scope === "global" ? "global" : "center"}`}>{s.scope}</span>
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                {s.topic || "General"} · {s.durationMin} min · {s.author}
                {s.scope === "global" ? "" : ` · ${s.center}`}
              </span>
              <button
                className="btn"
                style={{ marginTop: 10 }}
                disabled={busy === s.id || added[s.id]}
                onClick={() => addCopy(s.id)}
              >
                {added[s.id] ? "✓ Added to my library" : busy === s.id ? "Adding…" : "Add a copy"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
