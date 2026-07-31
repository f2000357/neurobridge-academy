"use client";

import Link from "next/link";
import { useState } from "react";

// The day, one moment at a time.
//
// Deliberately not a gallery. A child who struggles to hold a day together
// cannot reconstruct it from a wall of thumbnails — he needs it in order, one
// thing filling the screen, with a sentence that tells him what it was. The
// controls are two big targets and nothing else, and the whole thing works by
// tapping forward until the day runs out.

export type Moment = {
  id: string;
  kind: string;
  caption: string;
  at: number;
  who: string;
  where: string;
};

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function StoryPlayer({
  childFirstName,
  dayLabel,
  date,
  moments,
  backHref,
  allDaysHref,
}: {
  childFirstName: string;
  dayLabel: string;
  date: string;
  moments: Moment[];
  backHref: string;
  allDaysHref: string;
}) {
  const [i, setI] = useState(0);
  const m = moments[i];
  const first = i === 0;
  const last = i === moments.length - 1;

  return (
    <>
      <header className="topbar kidbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            {childFirstName}&apos;s day
          </span>
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 620 }}>
        <p className="eyebrow">{dayLabel}</p>
        <h1 style={{ margin: "4px 0 2px" }}>What I did</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {moments.length} thing{moments.length === 1 ? "" : "s"} from this day
          {m.where ? ` · ${m.where}` : ""}
        </p>

        {/* The moment itself, as big as it will go. */}
        <div
          className="card lift"
          style={{ padding: 0, overflow: "hidden", marginTop: 12, background: "var(--ink)" }}
        >
          {m.kind === "video" ? (
            <video
              key={m.id}
              src={`/api/media/${m.id}`}
              controls
              playsInline
              style={{ width: "100%", display: "block", maxHeight: "60vh", background: "#000" }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={m.id}
              src={`/api/media/${m.id}`}
              alt={m.caption || `Something from ${date}`}
              style={{ width: "100%", display: "block", maxHeight: "60vh", objectFit: "contain" }}
            />
          )}
        </div>

        <p style={{ fontSize: "1.2rem", lineHeight: 1.45, margin: "14px 0 4px" }}>
          {m.caption || "Here's a moment from your day."}
        </p>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          {clock(m.at)}
          {m.who ? ` · with ${m.who}` : ""}
        </p>

        <div className="row" style={{ gap: 10, marginTop: 16, alignItems: "center" }}>
          <button className="btn quiet" onClick={() => setI((n) => n - 1)} disabled={first}>
            ← Before
          </button>
          {last ? (
            <Link className="btn big" href={backHref}>
              That was my day 🎉
            </Link>
          ) : (
            <button className="btn big" onClick={() => setI((n) => n + 1)}>
              Then what? →
            </button>
          )}
        </div>

        {/* Where we are, without numbers to read. */}
        <div className="row" style={{ gap: 4, marginTop: 14, flexWrap: "wrap" }} aria-hidden="true">
          {moments.map((x, n) => (
            <span
              key={x.id}
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: n <= i ? "var(--accent)" : "var(--border)",
              }}
            />
          ))}
        </div>

        <p className="muted" style={{ marginTop: 18 }}>
          <Link href={allDaysHref}>← Other days</Link>
        </p>
      </main>
    </>
  );
}
