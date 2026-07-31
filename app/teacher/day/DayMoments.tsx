"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Reviewing the day, and adding to it while it happens.
//
// A guide running a six-hour camp block is the person holding the phone, so
// keeping a moment cannot require composing a write-up first. One line, one
// tap, back to the child.

export type DayBlock = { id: string; label: string; when: string };
export type DayMoment = { id: string; kind: string; caption: string; when: string; who: string };

export default function DayMoments({
  childId,
  childFirstName,
  storyHref,
  date,
  blocks,
  moments,
}: {
  childId: string;
  childFirstName: string;
  storyHref: string;
  date: string;
  blocks: DayBlock[];
  moments: DayMoment[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [forBlock, setForBlock] = useState<DayBlock | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function add(file: File, block: DayBlock) {
    setBusy(true);
    setNote(null);
    const form = new FormData();
    form.append("slotId", block.id);
    form.append("childId", childId);
    form.append("caption", caption.trim());
    form.append("file", file);
    const res = await fetch("/api/guide-note", { method: "POST", body: form });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) {
      setNote(d.error ?? "That didn't save.");
      return;
    }
    setCaption("");
    setNote("Added to his day.");
    router.refresh();
  }

  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Keep a moment</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          A photo or a short clip with one line about it. {childFirstName} plays the day back in
          order afterwards, so add them as they happen.
        </p>
        <input
          className="field"
          placeholder="What's happening? e.g. Built the tallest tower at camp"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        {blocks.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
            Nothing on his timetable for {date}.
          </p>
        ) : (
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {blocks.map((b) => (
              <button
                key={b.id}
                className="chip"
                disabled={busy}
                onClick={() => {
                  setForBlock(b);
                  fileRef.current?.click();
                }}
              >
                {busy && forBlock?.id === b.id ? "Saving…" : `📷 ${b.when} ${b.label}`}
              </button>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && forBlock) void add(f, forBlock);
            e.target.value = "";
          }}
        />
        {note && (
          <p className="muted" role="status" style={{ marginTop: 8, fontSize: "0.85rem" }}>
            {note}
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>
            {moments.length} moment{moments.length === 1 ? "" : "s"} on {date}
          </h2>
          {moments.length > 0 && (
            <Link className="btn quiet" href={storyHref}>
              ▶ Play it back
            </Link>
          )}
        </div>
        {moments.length === 0 ? (
          <p className="muted" style={{ marginTop: 8, fontSize: "0.85rem" }}>
            Nothing kept from this day yet.
          </p>
        ) : (
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {moments.map((m) => (
              <div key={m.id} className="row" style={{ gap: 10, alignItems: "center" }}>
                {m.kind === "video" ? (
                  <video className="media-thumb" src={`/api/media/${m.id}`} controls />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="media-thumb" src={`/api/media/${m.id}`} alt={m.caption || "moment"} />
                )}
                <span style={{ flex: 1 }}>
                  <span>{m.caption || <em className="muted">no caption</em>}</span>
                  <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>
                    {m.when}
                    {m.who ? ` · ${m.who}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
