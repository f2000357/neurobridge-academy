import Link from "next/link";
import LocalTime from "@/app/components/LocalTime";

// The whole day, in order, on one page you scroll.
//
// This was a stepper — one moment filling the screen, tap to advance. It turned
// a six-hour camp day into fifteen taps and gave no sense of the shape of it:
// you could not tell how much there had been, or skim back to the bit you
// wanted to talk about.
//
// Still deliberately not a wall of thumbnails. Each moment keeps a full-width
// picture and its own sentence underneath, in the order it happened, because a
// child who struggles to hold a day together needs it told rather than indexed.
// The difference is that the telling now sits in one continuous scroll.

export type Moment = {
  id: string;
  kind: string;
  caption: string;
  at: number;
  who: string;
  where: string;
};

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
          {moments.length} thing{moments.length === 1 ? "" : "s"} from this day, in the order they
          happened.
        </p>

        <div className="stack" style={{ gap: 28, marginTop: 16 }}>
          {moments.map((m) => (
            <figure key={m.id} style={{ margin: 0 }}>
              <div
                className="card lift"
                style={{ padding: 0, overflow: "hidden", background: "var(--ink)" }}
              >
                {m.kind === "video" ? (
                  <video
                    src={`/api/media/${m.id}`}
                    controls
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", display: "block", maxHeight: "70vh", background: "#000" }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/${m.id}`}
                    alt={m.caption || `Something from ${date}`}
                    loading="lazy"
                    style={{ width: "100%", display: "block", maxHeight: "70vh", objectFit: "contain" }}
                  />
                )}
              </div>
              <figcaption>
                <p style={{ fontSize: "1.2rem", lineHeight: 1.45, margin: "12px 0 2px" }}>
                  {m.caption || "Here's a moment from your day."}
                </p>
                <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
                  <LocalTime at={m.at} />
                  {m.where ? ` · ${m.where}` : ""}
                  {m.who ? ` · with ${m.who}` : ""}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p style={{ fontSize: "1.1rem", marginTop: 26 }}>That was my day 🎉</p>
        <p className="muted" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href={backHref}>← Back to my day</Link>
          <Link href={allDaysHref}>Other days →</Link>
        </p>
      </main>
    </>
  );
}
