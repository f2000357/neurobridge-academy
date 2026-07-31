"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Reviewing the day, and adding to it while it happens.
//
// A guide running a six-hour camp block is the person holding the phone, so
// keeping a moment cannot require composing a write-up first. One line, one
// tap, back to the child.

export type DayMoment = { id: string; kind: string; caption: string; when: string; who: string };

export default function DayMoments({
  childId,
  childFirstName,
  storyHref,
  date,
  moments,
}: {
  childId: string;
  childFirstName: string;
  storyHref: string;
  date: string;
  moments: DayMoment[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function add(file: File) {
    setBusy(true);
    setNote(null);
    const form = new FormData();
    form.append("childId", childId);
    form.append("date", date);
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
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="field"
            style={{ flex: 1, minWidth: 240 }}
            placeholder="What's happening? e.g. Built the tallest tower at camp"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && caption.trim()) fileRef.current?.click();
            }}
          />
          <button
            className="btn"
            disabled={busy || !caption.trim()}
            onClick={() => fileRef.current?.click()}
            title={caption.trim() ? "Choose a photo or video" : "Write a line first"}
          >
            {busy ? "Saving…" : "🖼 Add"}
          </button>
        </div>
        {!caption.trim() && (
          <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
            Write the line first — that is what he reads back. A photo on its own tells him nothing.
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void add(f);
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
            <Link className="btn big" href={storyHref}>
              ▶ Play the day back
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
