"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { specialtyLabel } from "@/lib/specialists";
import { fmtMin, weekdayShort } from "@/lib/time";

// Written at 9pm on a phone, in the car, after the lesson. One required box,
// three optional, and a camera button. Anything longer never gets filled in.

export type BlockRow = {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  label: string;
  lessonTitle: string;
  lessonGoal: string;
  lessonTopic: string;
  mine: boolean;
  /** May this specialist write the note for this block? Their activity only. */
  canNote: boolean;
  noteId: string | null;
};

export type MediaRow = { id: string; kind: string; caption: string; filename: string };

export type NoteRow = {
  id: string;
  date: string;
  slotId: string | null;
  authorId: string;
  authorName: string;
  authorSpecialty: string;
  subject: string;
  whatWeDid: string;
  wentWell: string;
  struggledWith: string;
  nextTime: string;
  focus: number | null;
  media: MediaRow[];
};

type Draft = {
  noteId: string | null;
  slotId: string | null;
  date: string;
  whatWeDid: string;
  wentWell: string;
  struggledWith: string;
  nextTime: string;
  focus: string;
};

const emptyDraft = (date: string, slotId: string | null = null): Draft => ({
  noteId: null,
  slotId,
  date,
  whatWeDid: "",
  wentWell: "",
  struggledWith: "",
  nextTime: "",
  focus: "",
});

export default function TeachConsole({
  childId,
  childName,
  teacherId,
  blocks,
  notes,
  today,
}: {
  childId: string;
  childName: string;
  teacherId: string;
  blocks: BlockRow[];
  notes: NoteRow[];
  today: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The note we're attaching media to — set once the draft has been saved.
  const [mediaNoteId, setMediaNoteId] = useState<string | null>(null);

  // Blocks the guide gave them, plus any block in the subject they teach —
  // a chess coach should find the chess blocks without being wired to each one.
  // Only their own sessions are theirs to write up. The rest of the day is shown
  // below as read-only context.
  const unwritten = blocks.filter((b) => !b.noteId && b.canNote);
  const context = blocks.filter((b) => !b.canNote);

  function startFor(block: BlockRow | null) {
    setNote(null);
    setMediaNoteId(null);
    if (!block) {
      setDraft(emptyDraft(today));
      return;
    }
    const existing = notes.find((n) => n.id === block.noteId);
    setDraft(
      existing
        ? {
            noteId: existing.id,
            slotId: existing.slotId,
            date: existing.date,
            whatWeDid: existing.whatWeDid,
            wentWell: existing.wentWell,
            struggledWith: existing.struggledWith,
            nextTime: existing.nextTime,
            focus: existing.focus == null ? "" : String(existing.focus),
          }
        : emptyDraft(block.date, block.id)
    );
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/teach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "saveNote", childId, ...draft }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setNote(data.error ?? "Could not save that.");
      return;
    }
    setMediaNoteId(data.noteId);
    setDraft((d) => (d ? { ...d, noteId: data.noteId } : d));
    setNote("Saved. Add a photo or video below, or close this.");
    router.refresh();
  }

  async function upload(files: FileList) {
    const target = mediaNoteId ?? draft?.noteId;
    if (!target) {
      setNote("Save the note first, then add the photo.");
      return;
    }
    setBusy(true);
    setNote(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("noteId", target);
      form.append("file", file);
      const res = await fetch("/api/teach", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) {
        setBusy(false);
        setNote(data.error ?? "That file didn't upload.");
        return;
      }
    }
    setBusy(false);
    setNote("Added.");
    router.refresh();
  }

  return (
    <>
      {/* Blocks waiting on a note */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Write a note</h2>
        {unwritten.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {unwritten.length} of your sessions with {childName} {unwritten.length === 1 ? "has" : "have"}{" "}
              no note yet.
            </p>
            <div className="stack" style={{ gap: 8 }}>
              {unwritten.map((b) => (
                <button key={b.id} className="block-pick" onClick={() => startFor(b)}>
                  <span className="block-when">
                    {weekdayShort(b.date)} · {fmtMin(b.startMin)}
                  </span>
                  <span className="block-what">
                    {b.label}
                    {b.mine && <span className="pill good">yours</span>}
                  </span>
                  <span className="block-go" aria-hidden="true">
                    ＋ note
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            No sessions waiting on a note. Thank you.
          </p>
        )}
        <button className="btn quiet" style={{ marginTop: 12 }} onClick={() => startFor(null)}>
          Note for a session that isn&apos;t listed
        </button>
      </div>

      {/* The rest of the child's day — context only, not yours to write up. */}
      {context.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2>The rest of {childName}&apos;s day</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            For context — how the day ran around your session. These aren&apos;t yours to write up.
          </p>
          <div className="stack" style={{ gap: 4, maxHeight: 300, overflowY: "auto" }}>
            {context.map((b) => (
              <div key={b.id} className="row" style={{ gap: 10, fontSize: "0.85rem", opacity: 0.85 }}>
                <span className="muted" style={{ minWidth: 108, fontVariantNumeric: "tabular-nums" }}>
                  {weekdayShort(b.date)} · {fmtMin(b.startMin)}
                </span>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The form */}
      {draft && (
        <div className="card note-form" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{draft.noteId ? "Edit note" : "New note"}</h2>
            <button className="chip" onClick={() => setDraft(null)} aria-label="Close">
              ✕
            </button>
          </div>

          <label className="lbl">Date</label>
          <input
            className="field short"
            type="date"
            max={today}
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
          />

          <label className="lbl">What we worked on</label>
          <textarea
            className="field"
            rows={2}
            value={draft.whatWeDid}
            onChange={(e) => set("whatWeDid", e.target.value)}
            placeholder="Scales in C, then the first line of the piece."
          />

          <label className="lbl">What went well (optional)</label>
          <textarea
            className="field"
            rows={2}
            value={draft.wentWell}
            onChange={(e) => set("wentWell", e.target.value)}
          />

          <label className="lbl">What was hard (optional)</label>
          <textarea
            className="field"
            rows={2}
            value={draft.struggledWith}
            onChange={(e) => set("struggledWith", e.target.value)}
          />

          <label className="lbl">Next time (optional)</label>
          <textarea
            className="field"
            rows={2}
            value={draft.nextTime}
            onChange={(e) => set("nextTime", e.target.value)}
          />

          <label className="lbl">How settled were they? (optional)</label>
          <div className="focus-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`chip ${draft.focus === String(n) ? "on" : ""}`}
                onClick={() => set("focus", draft.focus === String(n) ? "" : String(n))}
              >
                {n}
              </button>
            ))}
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              1 = a hard day · 5 = fully with me
            </span>
          </div>

          <div className="row" style={{ marginTop: 14, gap: 12, alignItems: "center" }}>
            <button className="btn" onClick={save} disabled={busy || !draft.whatWeDid.trim()}>
              {busy ? "Saving…" : draft.noteId ? "Save changes" : "Save note"}
            </button>
            <button
              className="btn quiet"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !(mediaNoteId ?? draft.noteId)}
              title={
                mediaNoteId ?? draft.noteId ? "Add a photo or video" : "Save the note first"
              }
            >
              📷 Photo or video
            </button>
            {note && <span className="muted">{note}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
            Photos up to 8&nbsp;MB, video up to 60&nbsp;MB. The family sees these; {childName} does not.
          </p>
        </div>
      )}

      {/* The child's note history, from every specialist */}
      <h2 style={{ marginTop: 30 }}>Notes so far</h2>
      {notes.length === 0 ? (
        <p className="muted">Nothing written yet.</p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {notes.map((n) => (
            <div key={n.id} className="card note-card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="note-who">
                  {n.authorName}
                  {n.authorId === teacherId && <span className="pill good">you</span>}
                </span>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  {specialtyLabel(n.subject || n.authorSpecialty)} · {weekdayShort(n.date)}
                </span>
              </div>
              <p style={{ marginBottom: 6 }}>{n.whatWeDid}</p>
              {n.wentWell && (
                <p className="muted" style={{ margin: "2px 0" }}>
                  <strong>Went well:</strong> {n.wentWell}
                </p>
              )}
              {n.struggledWith && (
                <p className="muted" style={{ margin: "2px 0" }}>
                  <strong>Hard:</strong> {n.struggledWith}
                </p>
              )}
              {n.nextTime && (
                <p className="muted" style={{ margin: "2px 0" }}>
                  <strong>Next time:</strong> {n.nextTime}
                </p>
              )}
              {n.focus != null && (
                <p className="muted" style={{ margin: "2px 0" }}>
                  <strong>Settled:</strong> {n.focus}/5
                </p>
              )}
              {n.media.length > 0 && (
                <div className="media-strip">
                  {n.media.map((m) =>
                    m.kind === "video" ? (
                      <video key={m.id} className="media-thumb" src={`/api/media/${m.id}`} controls />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={m.id}
                        className="media-thumb"
                        src={`/api/media/${m.id}`}
                        alt={m.caption || m.filename}
                      />
                    )
                  )}
                </div>
              )}
              {n.authorId === teacherId && (
                <button
                  className="chip"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setDraft({
                      noteId: n.id,
                      slotId: n.slotId,
                      date: n.date,
                      whatWeDid: n.whatWeDid,
                      wentWell: n.wentWell,
                      struggledWith: n.struggledWith,
                      nextTime: n.nextTime,
                      focus: n.focus == null ? "" : String(n.focus),
                    });
                    setMediaNoteId(n.id);
                    setNote(null);
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
