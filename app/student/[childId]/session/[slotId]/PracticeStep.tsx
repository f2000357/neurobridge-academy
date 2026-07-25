"use client";

import { useEffect, useRef, useState } from "react";
import type { Chunk } from "./player";
import { providerName } from "./player";

// A provider practice step: the child does the work on IXL (deep link),
// kept on task by a calm countdown that rings a gentle bell when time is up.
// On "I did it" the completion goes to the guide to check and award coins.

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// A soft two-tone chime via Web Audio — no asset, gentle by design.
function playBell() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      const t = now + i * 0.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.start(t);
      o.stop(t + 0.6);
    });
  } catch {
    /* audio not available — the visual "time's up" still shows */
  }
}

export default function PracticeStep({
  chunk,
  durationMin,
  childId,
  slotId,
  preview,
  onNext,
}: {
  chunk: Chunk;
  durationMin: number;
  childId: string;
  slotId?: string;
  preview: boolean;
  onNext: () => void;
}) {
  const provider = providerName(chunk.provider);
  const total = Math.max(1, Math.round(durationMin)) * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const rang = useRef(false);

  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      if (!rang.current) {
        rang.current = true;
        setTimeUp(true);
        if (!muted) playBell();
      }
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, left, muted]);

  function open(url: string) {
    if (!running) setRunning(true); // the timer starts when they go to work
    window.open(url, "_blank", "noopener");
  }

  async function done() {
    if (preview) {
      onNext();
      return;
    }
    setBusy(true);
    await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "submit",
        childId,
        slotId,
        title: chunk.title,
        provider: chunk.provider,
        practiceUrl: chunk.practiceUrl,
      }),
    }).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="practice-step">
      <div className={`practice-timer ${timeUp ? "up" : ""}`}>
        <span className="pt-clock" aria-live="polite">{fmt(Math.max(0, left))}</span>
        <span className="pt-label">{timeUp ? "Time's up — come back and mark it done" : running ? "Time to focus" : "Your time"}</span>
        <button
          className="chip pt-mute"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={muted}
          title={muted ? "Bell is off" : "Bell is on"}
        >
          {muted ? "🔕" : "🔔"}
        </button>
      </div>

      <p className="passage" style={{ margin: "14px 0" }}>
        {chunk.content || `Watch the video on ${provider}, then do the practice. Come back here when you're finished.`}
      </p>

      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        {chunk.videoUrl && (
          <button className="btn" onClick={() => open(chunk.videoUrl!)}>
            ▶ Watch on {provider}
          </button>
        )}
        {chunk.practiceUrl && (
          <button className="btn quiet" onClick={() => open(chunk.practiceUrl!)}>
            ✎ Practice on {provider}
          </button>
        )}
      </div>

      {sent ? (
        <div className="practice-sent">
          <p style={{ margin: "16px 0 6px" }}>✓ Nice work!</p>
          <p className="muted" style={{ marginTop: 0 }}>
            Your guide will check your work and add your coins. ⭐
          </p>
          <button className="btn" onClick={onNext}>Next →</button>
        </div>
      ) : (
        <>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 12 }}>
            Opens in a new tab. When you&apos;ve finished, come back and press done.
          </p>
          <button className="btn" style={{ marginTop: 8 }} onClick={done} disabled={busy}>
            {busy ? "One moment…" : "I did it"}
          </button>
        </>
      )}
    </div>
  );
}
