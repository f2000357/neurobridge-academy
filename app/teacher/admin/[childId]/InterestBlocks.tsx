"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ELECTIVES } from "@/lib/activities";

// What the family wants in the week besides academics. The parent says how
// often and how long; the guide plants the blocks and can move them after.

export type InterestRow = {
  activity: string;
  sessionsPerWeek: number;
  slotsPerSession: number;
  backToBack: boolean;
};

const COUNTS = [1, 2, 3, 4, 5];
const SLOTS = [1, 2, 3, 4];

export default function InterestBlocks({
  childId,
  childName,
  initial,
}: {
  childId: string;
  childName: string;
  initial: InterestRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<InterestRow[]>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const chosen = new Set(rows.map((r) => r.activity));
  const available = ELECTIVES.filter((e) => !chosen.has(e.id));

  function toggle(id: string) {
    setNote(null);
    setRows((rs) =>
      rs.some((r) => r.activity === id)
        ? rs.filter((r) => r.activity !== id)
        : [...rs, { activity: id, sessionsPerWeek: 1, slotsPerSession: 1, backToBack: true }]
    );
  }

  function update(id: string, patch: Partial<InterestRow>) {
    setNote(null);
    setRows((rs) => rs.map((r) => (r.activity === id ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setNote(null);
    await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "setInterests", childId, interests: rows }),
    });
    setBusy(false);
    setNote("Saved. The guide will see these as suggestions when building the week.");
    router.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>Special interest blocks</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Pick what {childName || "this child"} should have time for each week, and how much. These are
        placed in the afternoon so mornings stay academic — the guide can move or cancel any of them.
      </p>

      <div className="chip-wrap" style={{ marginBottom: 14 }}>
        {available.map((e) => (
          <button key={e.id} className="chip" onClick={() => toggle(e.id)}>
            {e.emoji} {e.label}
          </button>
        ))}
        {available.length === 0 && <span className="muted">All interests added.</span>}
      </div>

      {rows.length === 0 ? (
        <p className="muted">Nothing chosen yet. Add an interest above.</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {rows.map((r) => {
            const meta = ELECTIVES.find((e) => e.id === r.activity);
            const total = r.sessionsPerWeek * r.slotsPerSession;
            return (
              <div key={r.activity} className="interest-row">
                <span className="interest-name">
                  {meta?.emoji} {meta?.label ?? r.activity}
                </span>
                <label className="inline muted">
                  Times a week
                  <select
                    className="field tiny"
                    value={r.sessionsPerWeek}
                    onChange={(e) => update(r.activity, { sessionsPerWeek: Number(e.target.value) })}
                  >
                    {COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline muted">
                  Slots each
                  <select
                    className="field tiny"
                    value={r.slotsPerSession}
                    onChange={(e) => update(r.activity, { slotsPerSession: Number(e.target.value) })}
                  >
                    {SLOTS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {r.slotsPerSession > 1 && (
                  <label className="inline muted">
                    <input
                      type="checkbox"
                      checked={r.backToBack}
                      onChange={(e) => update(r.activity, { backToBack: e.target.checked })}
                    />
                    Back to back
                  </label>
                )}
                <span className="muted interest-sum">
                  {r.sessionsPerWeek},{r.slotsPerSession} · {total * 30} min a week
                </span>
                <button className="chip" onClick={() => toggle(r.activity)} aria-label="Remove">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="row" style={{ marginTop: 14, alignItems: "center", gap: 12 }}>
        <button className="btn quiet" onClick={save} disabled={busy}>
          Save interest blocks
        </button>
        {note && <span className="muted">{note}</span>}
      </div>
    </div>
  );
}
