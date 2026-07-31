"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Where to start, measured rather than guessed.
//
// Everything else here works out a child's level from the few skills the
// planner happened to pick, which is circular: plan grade 3, learn grade 3,
// conclude grade 3. The Diagnostic tests every strand on its own and hands back
// a grade for each. It sits at the top of the week because until it is done,
// every plan below it is an assumption.

type Slot = { id: string; label: string };
type Strand = { lane: string; strand: string; level: string | null };

const SUBJECTS = [
  ["math", "Maths"],
  ["reading", "Reading"],
  ["writing", "Writing"],
] as const;

export default function DiagnosticCard({
  childId,
  childName,
  from,
  hasResult,
  resultSummary,
}: {
  childId: string;
  childName: string;
  from: string;
  hasResult: boolean;
  resultSummary?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasResult);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [subject, setSubject] = useState<string>("math");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [strands, setStrands] = useState<Strand[] | null>(null);
  const [overall, setOverall] = useState("");

  const post = (b: unknown) =>
    fetch("/api/diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }).then((r) => r.json());

  useEffect(() => {
    if (!open) return;
    let live = true;
    post({ op: "slots", childId, from }).then((d) => {
      if (live && d?.ok) setSlots(d.slots ?? []);
    });
    return () => {
      live = false;
    };
  }, [open, childId, from]);

  async function schedule() {
    if (!slotId) return;
    setBusy(true);
    setNote(null);
    const d = await post({ op: "schedule", childId, slotId, subject });
    setBusy(false);
    if (!d?.ok) {
      setNote(d?.error ?? "Couldn't put that on the day.");
      return;
    }
    setNote(`Booked. It's on ${d.date} — he'll open it from his own day like any other lesson.`);
    setSlotId("");
    router.refresh();
  }

  async function readShot(file: File) {
    setBusy(true);
    setNote(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const d = await post({
      op: "read",
      childId,
      mimeType: file.type || "image/jpeg",
      imageBase64: btoa(bin),
    });
    setBusy(false);
    if (!d?.ok || !d.read) {
      setNote(d?.reason ?? d?.error ?? "Couldn't read that screen.");
      return;
    }
    setStrands(d.strands);
    setOverall(d.overall ?? "");
    setNote(d.note || null);
  }

  async function save() {
    if (!strands?.length) return;
    setBusy(true);
    const d = await post({ op: "save", childId, overall, strands });
    setBusy(false);
    if (!d?.ok) {
      setNote(d?.error ?? "Couldn't save that.");
      return;
    }
    setStrands(null);
    setNote(`Saved ${d.saved} strand levels. The planner will use these from the next week you generate.`);
    router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
            {hasResult ? "Where he's starting from" : `Find out where ${childName.split(" ")[0]} actually is`}
          </h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
            {hasResult
              ? resultSummary || "Diagnostic results are on file."
              : "The IXL Diagnostic tests every strand separately and gives a grade for each. Until it's done, the plan is working from the handful of skills it happened to choose."}
          </p>
        </div>
        <button className="chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide" : hasResult ? "Redo it" : "Set it up"}
        </button>
      </div>

      {open && (
        <div className="stack" style={{ gap: 12, marginTop: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <a className="btn quiet" href="https://www.ixl.com/diagnostic" target="_blank" rel="noreferrer">
              Open the IXL Diagnostic →
            </a>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Best split across sittings — about 30 questions a subject before it settles.
            </span>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="inline muted">
              Subject
              <select className="field short" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {SUBJECTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline muted" style={{ flex: 1, minWidth: 220 }}>
              Put it in a free flexible block
              <select className="field" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                <option value="">Choose a block…</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" onClick={schedule} disabled={busy || !slotId}>
              {busy ? "Working…" : "Book it"}
            </button>
          </div>
          {slots.length === 0 && (
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              No empty flexible blocks ahead — add one on the week below, then come back.
            </p>
          )}

          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label className="chip" style={{ cursor: "pointer" }}>
              📷 Record the results
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readShot(f);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Screenshot the Diagnostic&apos;s results page once he&apos;s done.
            </span>
          </div>

          {strands && (
            <div className="card" style={{ padding: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>
                <strong>Check this before it&apos;s saved</strong>
                {overall ? ` — ${overall}` : ""}
              </p>
              <ul className="stack" style={{ gap: 2, margin: 0, paddingLeft: 18 }}>
                {strands.map((s, i) => (
                  <li key={i} style={{ fontSize: "0.85rem" }}>
                    {s.lane} · {s.strand} — <strong>{s.level ?? "no level shown"}</strong>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn" onClick={save} disabled={busy}>
                  Save these levels
                </button>
                <button className="chip" onClick={() => setStrands(null)} disabled={busy}>
                  Discard
                </button>
              </div>
            </div>
          )}

          {note && (
            <p className="muted" role="status" style={{ margin: 0, fontSize: "0.85rem" }}>
              {note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
