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
type Archived = { id: string; name: string; username: string; guideName: string };
type GroupBy = "none" | "grade" | "age";

function masteryClass(m: number | null) {
  if (m == null) return "";
  if (m >= 80) return "good";
  if (m >= 50) return "warn";
  return "crit";
}

export default function CenterConsole({
  rows,
  guides,
  archived,
}: {
  rows: Row[];
  guides: Guide[];
  archived: Archived[];
}) {
  const router = useRouter();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [by, setBy] = useState<GroupBy>("none");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Onboarding
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [lName, setLName] = useState("");
  const [lGuide, setLGuide] = useState(guides[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function centerPost(payload: Record<string, unknown>) {
    const res = await fetch("/api/center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function addGuide() {
    if (!gName.trim() || busy) return;
    setBusy(true);
    const r = await centerPost({ op: "addGuide", name: gName, email: gEmail });
    setBusy(false);
    if (r.error) return setNote(r.error);
    setGName("");
    setGEmail("");
    setNote(`Guide ${gName} added.`);
    router.refresh();
  }

  async function addLearner() {
    if (!lName.trim() || !lGuide || busy) return;
    setBusy(true);
    const r = await centerPost({ op: "addLearner", name: lName, guideId: lGuide });
    setBusy(false);
    if (r.error) return setNote(r.error);
    setLName("");
    setNote(`Learner ${lName} added.`);
    router.refresh();
  }

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

  async function setArchived(childId: string, archived: boolean) {
    setBusyId(childId);
    await centerPost({ op: "setArchived", childId, archived });
    setBusyId(null);
    router.refresh();
  }

  async function deleteLearner(childId: string) {
    setBusyId(childId);
    const r = await centerPost({ op: "deleteLearner", childId });
    setBusyId(null);
    setConfirmDel(null);
    if (r.error) setNote(r.error);
    else router.refresh();
  }

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

      <div className="onboard-grid" style={{ marginTop: 18 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add a guide</h3>
          <div className="stack" style={{ gap: 8 }}>
            <input className="field" placeholder="Full name" value={gName} onChange={(e) => setGName(e.target.value)} />
            <input className="field" placeholder="Email (optional)" value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
            <button className="btn" onClick={addGuide} disabled={busy || !gName.trim()}>
              Add guide
            </button>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add a learner</h3>
          <div className="stack" style={{ gap: 8 }}>
            <input className="field" placeholder="Learner name" value={lName} onChange={(e) => setLName(e.target.value)} />
            <select className="field" value={lGuide} onChange={(e) => setLGuide(e.target.value)}>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  Guide: {g.name}
                </option>
              ))}
            </select>
            <button className="btn" onClick={addLearner} disabled={busy || !lName.trim() || !lGuide}>
              Add learner
            </button>
          </div>
        </div>
        {note && (
          <p className="muted" role="status" style={{ gridColumn: "1 / -1", margin: 0 }}>
            {note}
          </p>
        )}
      </div>

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
                  <Link href={`/report/${r.username}`} className="roster-name" title="Open progress report">
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

                <button
                  className="chip"
                  title="Deactivate this learner"
                  disabled={busyId === r.id}
                  onClick={() => setArchived(r.id, true)}
                >
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {archived.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 className="group-head">Deactivated ({archived.length})</h2>
          <div className="roster">
            {archived.map((a) => (
              <div key={a.id} className="roster-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
                <div className="roster-id">
                  <span className="roster-name" style={{ color: "var(--ink-soft)" }}>
                    {a.name}
                  </span>
                  <span className="roster-sub">was with {a.guideName}</span>
                </div>
                <button className="chip" disabled={busyId === a.id} onClick={() => setArchived(a.id, false)}>
                  Reactivate
                </button>
                {confirmDel === a.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <button className="chip danger" disabled={busyId === a.id} onClick={() => deleteLearner(a.id)}>
                      Delete forever
                    </button>
                    <button className="chip" onClick={() => setConfirmDel(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button className="chip danger" onClick={() => setConfirmDel(a.id)}>
                    Remove…
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
            Deactivated learners can&apos;t sign in and are hidden from guides. Removing is permanent and
            erases all their work.
          </p>
        </section>
      )}
    </div>
  );
}
