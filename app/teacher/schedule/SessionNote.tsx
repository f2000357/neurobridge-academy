"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// A guide writing up a session they ran themselves.
//
// The same four questions a visiting specialist answers, because the note ends
// up in the same place — the child's record, the weekly report, the evidence
// behind the learning profile. A parent who runs most of their child's day
// should not have to hand that to a therapist to have it written down.

export type NoteTarget = {
  slotId: string;
  label: string;
  date: string;
  childId: string;
  noteId: string | null;
  existing: {
    whatWeDid: string;
    wentWell: string;
    struggledWith: string;
    nextTime: string;
  } | null;
};

const EMPTY = { whatWeDid: "", wentWell: "", struggledWith: "", nextTime: "" };

export default function SessionNote({
  target,
  onClose,
}: {
  target: NoteTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState(target.existing ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const empty = !Object.values(f).some((v) => v.trim());

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/guide-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "saveNote",
        childId: target.childId,
        slotId: target.slotId,
        noteId: target.noteId ?? undefined,
        date: target.date,
        ...f,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.error) return setError(d.error);
    onClose();
    router.refresh();
  }

  // Only ever your own note — the API checks `authorUserId` again, so this is a
  // convenience, not the guard. Any photos or videos on it go with it.
  async function remove() {
    if (!target.noteId) return;
    if (!confirm("Delete this note? Anything attached to it goes too, and it leaves the child's record.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/guide-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "deleteNote", noteId: target.noteId }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.error) return setError(d.error);
    onClose();
    router.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>
          {target.noteId ? "Edit your note" : "Write up"} — {target.label}
        </h3>
        <span className="muted" style={{ fontSize: "0.82rem" }}>
          {target.date}
        </span>
      </div>

      <label className="lbl" style={{ marginTop: 12 }}>
        What you did
      </label>
      <textarea
        className="field"
        rows={2}
        value={f.whatWeDid}
        onChange={(e) => set("whatWeDid", e.target.value)}
        placeholder="Scales, then the new piece."
      />

      <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <label className="inline muted" style={{ flex: "1 1 220px" }}>
          What went well
          <textarea
            className="field"
            rows={2}
            value={f.wentWell}
            onChange={(e) => set("wentWell", e.target.value)}
          />
        </label>
        <label className="inline muted" style={{ flex: "1 1 220px" }}>
          What was hard
          <textarea
            className="field"
            rows={2}
            value={f.struggledWith}
            onChange={(e) => set("struggledWith", e.target.value)}
          />
        </label>
      </div>

      <label className="lbl" style={{ marginTop: 10 }}>
        Next time
      </label>
      <textarea
        className="field"
        rows={2}
        value={f.nextTime}
        onChange={(e) => set("nextTime", e.target.value)}
      />

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--crit)" }}>
          {error}
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center" }}>
        <button className="btn" onClick={save} disabled={busy || empty}>
          {busy ? "Saving…" : "Save note"}
        </button>
        <button className="btn quiet" onClick={onClose}>
          Cancel
        </button>
        {target.noteId && (
          <button
            className="chip danger"
            onClick={remove}
            disabled={busy}
            style={{ marginLeft: "auto" }}
          >
            Delete note
          </button>
        )}
      </div>
    </div>
  );
}
