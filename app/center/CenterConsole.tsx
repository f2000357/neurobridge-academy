"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  name: string;
  username: string;
  age: number | null;
  guideId: string;
  guideName: string;
  grade: string;
  mastery: number | null;
  balance: number;
  hwDone: number;
  hwTotal: number;
};
type Guide = { id: string; name: string };
type GroupBy = "none" | "grade" | "age";

function masteryClass(m: number | null) {
  if (m == null) return "";
  if (m >= 80) return "good";
  if (m >= 50) return "warn";
  return "crit";
}

export default function CenterConsole({ rows, guides }: { rows: Row[]; guides: Guide[] }) {
  const router = useRouter();
  const [by, setBy] = useState<GroupBy>("none");
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (by === "none") return [{ label: "", rows }];
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key =
        by === "grade" ? (r.grade ? `Grade ${r.grade}` : "Grade —") : r.age != null ? `Age ${r.age}` : "Age —";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([label, rs]) => ({ label, rows: rs }));
  }, [by, rows]);

  async function transfer(childId: string, toGuideId: string) {
    setBusyId(childId);
    await fetch("/api/center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "transfer", childId, toGuideId }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div>
      <p className="eyebrow">Center admin</p>
      <h1>How everyone is doing</h1>
      <p className="muted">
        {rows.length} learner{rows.length === 1 ? "" : "s"} across {guides.length} guide
        {guides.length === 1 ? "" : "s"}. Move a learner between guides anytime — their whole history
        goes with them.
      </p>

      <div className="dash-bar" style={{ marginTop: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
        <span className="t">Group by</span>
        {(["none", "grade", "age"] as GroupBy[]).map((g) => (
          <button key={g} className={`chip ${by === g ? "on" : ""}`} onClick={() => setBy(g)}>
            {g === "none" ? "No filter" : g === "grade" ? "Grade" : "Age"}
          </button>
        ))}
      </div>

      {groups.map((grp) => (
        <section key={grp.label || "all"} style={{ marginTop: 22 }}>
          {grp.label && <h2 className="group-head">{grp.label}</h2>}
          <div className="roster">
            {grp.rows.map((r) => (
              <div key={r.id} className="roster-row">
                <div className="roster-id">
                  <Link href={`/teacher/admin/${r.username}`} className="roster-name">
                    {r.name}
                  </Link>
                  <span className="roster-sub">
                    {r.grade ? `Gr ${r.grade}` : "Gr —"}
                    {r.age != null ? ` · age ${r.age}` : ""}
                  </span>
                </div>

                <div className="roster-mastery">
                  <div className="bar">
                    <span
                      className={masteryClass(r.mastery)}
                      style={{ width: `${r.mastery ?? 0}%`, display: "block", height: "100%", borderRadius: 999 }}
                    />
                  </div>
                  <span className="roster-metric">
                    {r.mastery == null ? "no data" : `${r.mastery}% mastery`}
                  </span>
                </div>

                <span className="roster-metric tabnum">⭐ {r.balance}</span>
                <span className="roster-metric tabnum">
                  HW {r.hwDone}/{r.hwTotal}
                </span>

                <label className="roster-guide">
                  <span className="roster-sub">Guide</span>
                  <select
                    className="field tiny"
                    value={r.guideId}
                    disabled={busyId === r.id}
                    onChange={(e) => e.target.value !== r.guideId && transfer(r.id, e.target.value)}
                  >
                    {guides.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
