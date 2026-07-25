"use client";

import Link from "next/link";

// The Schedule surface has two views of the same blocks: one day at a time, or
// the whole week at a glance. This toggle sits at the top of both.
export default function ScheduleTabs({ active }: { active: "day" | "week" }) {
  return (
    <div className="row" style={{ gap: 6, marginBottom: 10 }} role="tablist" aria-label="Schedule view">
      <Link
        href="/teacher/schedule"
        role="tab"
        aria-selected={active === "day"}
        className={`chip ${active === "day" ? "on" : ""}`}
      >
        Day
      </Link>
      <Link
        href="/teacher/week"
        role="tab"
        aria-selected={active === "week"}
        className={`chip ${active === "week" ? "on" : ""}`}
      >
        Week
      </Link>
    </div>
  );
}
