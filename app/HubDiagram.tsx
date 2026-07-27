"use client";

import { useState } from "react";

// The whole idea in one picture.
//
// The mark is an arc spanning two piers; here it is repeated six times. Each
// system that touches the child is a pier, each arc between them is NeuroBridge,
// and every support beam lands on the PARENT — not on the child — because
// nothing reaches this child without the parent deciding it should.
//
// Geometry: six piers at exact 60° spacing on r=245 about (400, 340), with the
// bottom gap left free for the wordmark badge.

type Part = { id: string; spoke: string; caption: React.ReactNode };

const PARTS: Record<string, Part> = {
  parent: {
    id: "parent",
    spoke: "",
    caption: (
      <>
        <b>The parent drives.</b> Every plan is a proposal — approve it, edit it, or throw it out.
      </>
    ),
  },
  school: {
    id: "school",
    spoke: "s5",
    caption: (
      <>
        <b>School</b> sees six hours a day. We track it rather than replace it.
      </>
    ),
  },
  iep: {
    id: "iep",
    spoke: "s0",
    caption: (
      <>
        <b>The IEP</b> stops being a yearly PDF and becomes what every week is measured against.
      </>
    ),
  },
  tests: {
    id: "tests",
    spoke: "s1",
    caption: (
      <>
        <b>Test scores</b> stop being a twice-yearly verdict and start setting next week&apos;s work.
      </>
    ),
  },
  therapies: {
    id: "therapies",
    spoke: "s2",
    caption: (
      <>
        <b>Therapies</b> write into one record instead of three systems nobody reconciles.
      </>
    ),
  },
  activities: {
    id: "activities",
    spoke: "s3",
    caption: (
      <>
        <b>Activities</b> they love are part of the plan, not the first thing dropped.
      </>
    ),
  },
  home: {
    id: "home",
    spoke: "s4",
    caption: (
      <>
        <b>Home</b> is where the gap closes — practice in the hours you already control.
      </>
    ),
  },
};

const PIERS: { key: string; x: number; y: number; label: string }[] = [
  { key: "school", x: 277.5, y: 127.8, label: "School" },
  { key: "iep", x: 522.5, y: 127.8, label: "IEP" },
  { key: "tests", x: 645, y: 340, label: "Tests" },
  { key: "therapies", x: 522.5, y: 552.2, label: "Therapies" },
  { key: "activities", x: 277.5, y: 552.2, label: "Activities" },
  { key: "home", x: 155, y: 340, label: "Home" },
];

const SPANS = [
  "M567.1 160.8 A 245 245 0 0 1 638.7 284.9",
  "M638.7 395.1 A 245 245 0 0 1 567.1 519.2",
  "M471.6 574.3 A 245 245 0 0 1 328.4 574.3",
  "M232.9 519.2 A 245 245 0 0 1 161.3 395.1",
  "M161.3 284.9 A 245 245 0 0 1 232.9 160.8",
  "M328.4 105.7 A 245 245 0 0 1 471.6 105.7",
];

const SUPPORTS = [
  { id: "s0", x1: 473, y1: 213.6, x2: 499.5, y2: 167.6 },
  { id: "s1", x1: 546, y1: 340, x2: 599, y2: 340 },
  { id: "s2", x1: 473, y1: 466.4, x2: 499.5, y2: 512.4 },
  { id: "s3", x1: 327, y1: 466.4, x2: 300.5, y2: 512.4 },
  { id: "s4", x1: 254, y1: 340, x2: 201, y2: 340 },
  { id: "s5", x1: 327, y1: 213.6, x2: 300.5, y2: 167.6 },
];

export default function HubDiagram() {
  const [active, setActive] = useState<string | null>(null);
  const part = active ? PARTS[active] : null;

  // Hovering a pier lights its own support beam, so the relationship being
  // described is the one highlighted.
  const litSpoke = part?.spoke ?? "";

  return (
    <div className="hub">
      <svg
        viewBox="0 0 800 690"
        role="img"
        aria-label="The child at the centre, surrounded by the parent who drives. NeuroBridge is the AI bridge connecting school, the IEP, standardized tests, therapies, extracurriculars and home — all reaching the child through the parent."
      >
        <defs>
          <linearGradient id="hubCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--coral)" />
          </linearGradient>
          <linearGradient id="hubSpan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--coral)" />
          </linearGradient>
        </defs>

        <circle className="hub-band" cx="400" cy="340" r="245" />

        {SPANS.map((d, i) => (
          <path key={i} className="hub-span" d={d} style={{ animationDelay: `${0.15 + i * 0.12}s` }} />
        ))}

        {SUPPORTS.map((s, i) => (
          <line
            key={s.id}
            className={`hub-spoke ${litSpoke === s.id ? "on" : ""}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            style={{ animationDelay: `${0.95 + i * 0.07}s` }}
          />
        ))}

        {/* The parent: the ring the child sits inside. Dashed — a gate, not a wall. */}
        <g
          className={`hub-parent ${active === "parent" ? "on" : ""}`}
          tabIndex={0}
          role="button"
          aria-label="The parent drives"
          onMouseEnter={() => setActive("parent")}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive("parent")}
          onBlur={() => setActive(null)}
        >
          <circle className="hub-parent-ring" cx="400" cy="340" r="142" />
          <g className="hub-parent-badge">
            <rect x="345" y="184" width="110" height="28" rx="14" />
            <text x="400" y="199">
              PARENT
            </text>
          </g>
        </g>

        {/* The child */}
        <circle className="hub-core" cx="400" cy="340" r="94" />
        <text className="hub-core-label" x="400" y="330" fontSize="25" textAnchor="middle">
          The child
        </text>
        <text className="hub-core-sub" x="400" y="362" textAnchor="middle">
          at the centre
        </text>

        {/* The bridge, named on itself */}
        <g className="hub-badge" style={{ animationDelay: "1.05s" }}>
          <rect x="337" y="562" width="126" height="42" rx="21" />
          <text className="hb-1" x="400" y="577">
            NEUROBRIDGE
          </text>
          <text className="hb-2" x="400" y="592">
            AI-DRIVEN
          </text>
        </g>

        {PIERS.map((p, i) => (
          <g
            key={p.key}
            className={`hub-node ${active === p.key ? "on" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={p.label}
            style={{ animationDelay: `${1.5 + i * 0.05}s` }}
            onMouseEnter={() => setActive(p.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(p.key)}
            onBlur={() => setActive(null)}
          >
            <circle cx={p.x} cy={p.y} r="46" />
            <text x={p.x} y={p.y}>
              {p.label}
            </text>
          </g>
        ))}
      </svg>

      <p className="hub-caption">
        {part ? (
          part.caption
        ) : (
          <>
            Six systems, one child. <b>The arcs are NeuroBridge</b> — and everything reaches the
            child through the parent.
          </>
        )}
      </p>
      <p className="hub-hint">Hover or tab through any part of the bridge</p>
    </div>
  );
}
