"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type LearnerRow = {
  id: string;
  name: string;
  username: string;
  age: number | null;
  center: string;
  guide: string;
  points: number;
};

export default function AdminLearners({ rows }: { rows: LearnerRow[] }) {
  const [q, setQ] = useState("");
  const [center, setCenter] = useState("all");

  const centers = useMemo(() => ["all", ...new Set(rows.map((r) => r.center))], [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (center !== "all" && r.center !== center) return false;
      if (!needle) return true;
      return [r.name, r.center, r.guide].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, center]);

  return (
    <>
      <div className="dash-bar" style={{ marginTop: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
        <select className="field short" value={center} onChange={(e) => setCenter(e.target.value)}>
          {centers.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "All centers" : c}
            </option>
          ))}
        </select>
        <input
          className="field"
          style={{ marginLeft: "auto", maxWidth: 260 }}
          placeholder="Search name, center, guide…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <p className="muted" style={{ marginTop: 18 }}>
          No learners match.
        </p>
      ) : (
        <div className="roster" style={{ marginTop: 16 }}>
          {list.map((r) => (
            <div key={r.id} className="roster-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr auto auto" }}>
              <span className="roster-name">{r.name}</span>
              <span className="roster-sub">{r.center}</span>
              <span className="roster-sub">Guide {r.guide}</span>
              <span className="roster-metric tabnum">⭐ {r.points}</span>
              <Link href={`/report/${r.username}`} className="btn quiet">
                📊 Report
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
