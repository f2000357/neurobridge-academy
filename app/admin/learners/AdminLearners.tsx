"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type LearnerRow = {
  id: string;
  name: string;
  username: string;
  age: number | null;
  centerId: string | null;
  center: string;
  guide: string;
  points: number;
};
type Center = { id: string; name: string };
type Guide = { id: string; name: string; centerId: string | null };

const HOMESCHOOL = "__homeschool__";

export default function AdminLearners({
  rows,
  centers,
  guides,
}: {
  rows: LearnerRow[];
  centers: Center[];
  guides: Guide[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [center, setCenter] = useState("all");

  // Move flow
  const [moving, setMoving] = useState<LearnerRow | null>(null);
  const [dest, setDest] = useState<string>(HOMESCHOOL);
  const [guideId, setGuideId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const centerNames = useMemo(() => ["all", ...new Set(rows.map((r) => r.center))], [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (center !== "all" && r.center !== center) return false;
      if (!needle) return true;
      return [r.name, r.center, r.guide].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, center]);

  // Only guides who actually belong to the chosen destination can receive them.
  const destGuides = useMemo(
    () => guides.filter((g) => (g.centerId ?? HOMESCHOOL) === dest),
    [guides, dest]
  );

  function openMove(r: LearnerRow) {
    setMoving(r);
    setNote(null);
    const d = r.centerId ?? HOMESCHOOL;
    setDest(d);
    setGuideId("");
  }

  async function confirmMove() {
    if (!moving || !guideId) return;
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "moveLearner",
        childId: moving.id,
        toCenterId: dest === HOMESCHOOL ? null : dest,
        toGuideId: guideId,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) return setNote(data.error);
    setMoving(null);
    router.refresh();
  }

  return (
    <>
      <div className="dash-bar" style={{ marginTop: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
        <select className="field short" value={center} onChange={(e) => setCenter(e.target.value)}>
          {centerNames.map((c) => (
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

      {note && (
        <p className="muted" role="status" style={{ marginTop: 12 }}>
          {note}
        </p>
      )}

      {list.length === 0 ? (
        <p className="muted" style={{ marginTop: 18 }}>
          No learners match.
        </p>
      ) : (
        <div className="roster" style={{ marginTop: 16 }}>
          {list.map((r) => (
            <div key={r.id}>
              <div className="roster-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr auto auto auto" }}>
                <span className="roster-name">{r.name}</span>
                <span className="roster-sub">{r.center}</span>
                <span className="roster-sub">Guide {r.guide}</span>
                <span className="roster-metric tabnum">⭐ {r.points}</span>
                <Link href={`/report/${r.username}`} className="btn quiet">
                  📊 Report
                </Link>
                <button className="chip" onClick={() => (moving?.id === r.id ? setMoving(null) : openMove(r))}>
                  Move…
                </button>
              </div>

              {moving?.id === r.id && (
                <div className="move-panel">
                  <label className="inline muted">
                    Move to
                    <select
                      className="field short"
                      value={dest}
                      onChange={(e) => {
                        setDest(e.target.value);
                        setGuideId("");
                      }}
                    >
                      <option value={HOMESCHOOL}>Homeschool (no center)</option>
                      {centers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline muted">
                    Guide there
                    <select
                      className="field short"
                      value={guideId}
                      onChange={(e) => setGuideId(e.target.value)}
                    >
                      <option value="">Choose a guide…</option>
                      {destGuides.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn" disabled={!guideId || busy} onClick={confirmMove}>
                    {busy ? "Moving…" : "Move learner"}
                  </button>
                  <button className="chip" onClick={() => setMoving(null)}>
                    Cancel
                  </button>
                  {destGuides.length === 0 && (
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      No guides there yet — add one first.
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
