"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Three kinds of person sign in here and they use different doors. Rather than
// making a visitor guess which link is theirs, one "Log in" button opens the
// list and names each one. Learners are mentioned but not linked — they sign in
// at their own address with a code, which nobody else can navigate to.

export default function LoginMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lp-menu" ref={wrap}>
      <button
        className="btn quiet lp-menu-btn"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Log in
        <span className={`lp-caret ${open ? "up" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="lp-menu-panel" role="menu">
          <Link href="/login" className="lp-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="lp-menu-title">Parent or guide</span>
            <span className="lp-menu-sub">Plan the week, run the day, manage your team</span>
          </Link>

          <Link href="/teach" className="lp-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="lp-menu-title">Therapist or teacher</span>
            <span className="lp-menu-sub">See the day and leave notes for the family</span>
          </Link>

          <p className="lp-menu-note">
            Learners sign in at their own link with the code their guide gives them.
          </p>
        </div>
      )}
    </div>
  );
}
