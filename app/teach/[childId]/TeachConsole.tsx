"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { specialtyLabel } from "@/lib/specialists";
import { fmtMin, weekdayShort } from "@/lib/time";

// 100px per hour — the guide's schedule uses the same scale.
const PX_PER_MIN = 100 / 60;

// Written at 9pm on a phone, in the car, after the lesson. One required box,
// three optional, and a camera button. Anything longer never gets filled in.

export type BlockRow = {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  label: string;
  /** Block shape — drives the same colours the guide's calendar uses. */
  kind: string;
  subject: string;
  lessonTitle: string;
  lessonGoal: string;
  lessonTopic: string;
  mine: boolean;
  /** May this specialist write the note for this block? Their activity only. */
  canNote: boolean;
  noteId: string | null;
  /** Points already given for this session, or null if none yet. */
  coins: number | null;
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
  // Every session that is theirs — the note list is a to-do, this is the record.
  const mine = blocks.filter((b) => b.canNote);

  // The day view below. `blocks` spans three weeks, so showing them all at once
  // was a flat scroll of undated rows under a heading that said "day" — you
  // could not tell where a session sat, or what came before it. One date at a
  // time, whole day, gaps included, so the shape of it reads.
  // `blocks` arrives date-desc, so this is newest first.
  const dates = [...new Set(blocks.map((b) => b.date))];
  const [dayDate, setDayDate] = useState(dates[0] ?? today);
  const day = blocks
    .filter((b) => b.date === dayDate)
    .sort((a, b) => a.startMin - b.startMin);

  // Same scale as the guide's schedule, so a therapist and a parent are looking
  // at the day at the same size. The window covers 9–3 at minimum and stretches
  // to whole hours around anything outside it.
  const dayStarts = day.map((b) => b.startMin);
  const dayEnds = day.map((b) => b.endMin);
  const winStart = Math.floor(Math.min(9 * 60, ...(dayStarts.length ? dayStarts : [9 * 60])) / 60) * 60;
  const winEnd = Math.ceil(Math.max(15 * 60, ...(dayEnds.length ? dayEnds : [15 * 60])) / 60) * 60;
  const gridTop = (m: number) => (m - winStart) * PX_PER_MIN;
  const dayHeight = (winEnd - winStart) * PX_PER_MIN;
  const dayHours: number[] = [];
  for (let m = winStart; m <= winEnd; m += 60) dayHours.push(m);

  // Points for a session they supervised. No provider score here — the adult who
  // was in the room says how it went. One award per session; awarding again
  // edits the first rather than stacking.
  const [awarding, setAwarding] = useState<{ block: BlockRow; coins: number } | null>(null);
  const [awardBusy, setAwardBusy] = useState(false);

  async function giveCoins() {
    if (!awarding) return;
    setAwardBusy(true);
    const res = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "awardSession",
        childId,
        slotId: awarding.block.id,
        coins: awarding.coins,
        title: awarding.block.label,
      }),
    });
    const d = await res.json();
    setAwardBusy(false);
    if (d.error) {
      setNote(d.error);
      return;
    }
    setAwarding(null);
    router.refresh();
  }

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
    return data.noteId as string;
  }

  // Media hangs off a saved note, so there is nothing to attach to until the
  // note exists. That used to be expressed by disabling the button, with the
  // reason in a `title` — which browsers do not show on a disabled control, so
  // it simply read as broken. Save first, then open the picker.
  // Yours to remove only while this learner is still assigned to you — the
  // server decides that, and says so plainly if the answer is no.
  async function removeNote(noteId: string) {
    if (!confirm("Delete this note? Anything attached to it goes too, and it leaves the child's record.")) {
      return;
    }
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/teach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "deleteNote", noteId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setNote(data.error ?? "Could not delete that note.");
      return;
    }
    if (draft?.noteId === noteId) setDraft(null);
    setNote("Deleted.");
    router.refresh();
  }

  async function pickMedia() {
    let target = mediaNoteId ?? draft?.noteId ?? null;
    if (!target) {
      if (!draft?.whatWeDid.trim()) {
        setNote("Write what you did first — then the photo has something to attach to.");
        return;
      }
      target = (await save()) ?? null;
      if (!target) return;
    }
    fileRef.current?.click();
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

      {/* Points for the sessions they ran. */}
      {mine.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2>Points for your sessions</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            You were in the room, so you decide how it went. {childName} can spend these on the
            prizes their family sets. One award per session — awarding again changes it.
          </p>

          <div className="stack" style={{ gap: 8 }}>
            {mine.map((b) => (
              <div key={b.id} className="award-row">
                <span className="block-when">
                  {weekdayShort(b.date)} · {fmtMin(b.startMin)}
                </span>
                <span className="block-what">{b.label}</span>

                {awarding?.block.id === b.id ? (
                  <span className="award-pick">
                    <select
                      className="field short"
                      value={awarding.coins}
                      onChange={(e) => setAwarding({ block: b, coins: Number(e.target.value) })}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "point" : "points"}
                        </option>
                      ))}
                    </select>
                    <button className="btn" disabled={awardBusy} onClick={giveCoins}>
                      {awardBusy ? "…" : "Give"}
                    </button>
                    <button className="btn quiet" onClick={() => setAwarding(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className={`btn quiet ${b.coins != null ? "" : "award-cta"}`}
                    onClick={() => setAwarding({ block: b, coins: b.coins ?? 8 })}
                  >
                    {b.coins != null ? `★ ${b.coins} given · change` : "Award points"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The child's whole day, one date at a time. Read-only: only their own
          sessions are theirs to write up, and those are marked. */}
      {dates.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0 }}>{childName}&apos;s day</h2>
            <select
              className="field short"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              aria-label="Which day"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {weekdayShort(d)} {d}
                </option>
              ))}
            </select>
          </div>
          <p className="muted" style={{ marginTop: 6, fontSize: "0.85rem" }}>
            The whole day, so you can see where your session sat in it. Only the blocks marked{" "}
            <b>yours</b> are yours to write up.
          </p>

          {day.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>Nothing was scheduled that day.</p>
          ) : (
            // The same grid the guide sees on their own schedule — one column
            // instead of five, and nothing draggable. Gaps are real space here,
            // so the shape of the day reads without having to be described.
            <div className="wg-body" style={{ gridTemplateColumns: "56px 1fr", height: dayHeight }}>
              <div className="wg-times">
                {dayHours.map((m) => (
                  <div key={m} className="wg-time" style={{ top: gridTop(m) }}>
                    {fmtMin(m)}
                  </div>
                ))}
              </div>
              <div className="wg-col">
                {dayHours.map((m) => (
                  <div key={m} className="wg-hourline" style={{ top: gridTop(m) }} />
                ))}
                {day.map((b) => (
                  <div
                    key={b.id}
                    className={`wg-block k-${b.kind}${b.subject ? ` subj-${b.subject}` : ""}`}
                    style={{
                      top: gridTop(b.startMin),
                      height: (b.endMin - b.startMin) * PX_PER_MIN,
                      cursor: "default",
                      // Theirs stands out; the rest of the day recedes but stays legible.
                      opacity: b.canNote ? 1 : 0.55,
                      outline: b.canNote ? "2px solid var(--accent)" : "none",
                    }}
                    title={`${fmtMin(b.startMin)}–${fmtMin(b.endMin)} · ${b.label}`}
                  >
                    <span className="wg-btitle">{b.label}</span>
                    <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>
                      {fmtMin(b.startMin)}–{fmtMin(b.endMin)}
                      {b.canNote ? " · yours" : ""}
                      {b.canNote && b.noteId ? " · noted" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            <button className="btn quiet" onClick={pickMedia} disabled={busy}>
              📷 Photo or video
            </button>
            {note && <span className="muted">{note}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
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
                <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                  <button
                    className="chip"
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
                  <button
                    className="chip danger"
                    onClick={() => removeNote(n.id)}
                    disabled={busy}
                    style={{ marginLeft: "auto" }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
