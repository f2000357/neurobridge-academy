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
  const [reading, setReading] = useState(false);
  const [readOut, setReadOut] = useState<string | null>(null);
  const shotRef = useRef<HTMLInputElement>(null);
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

  // Grab the score off IXL itself, rather than asking anyone to read or
  // photograph it.
  //
  // We cannot screenshot another site's tab from here — no browser permits
  // that, at any privilege level. What we can do is open IXL and ask the
  // browser to share that tab with us: the child picks it once in the browser's
  // own picker, we take a single frame, and we stop. The picker cannot be
  // skipped, and should not be.
  async function grabFromIxl() {
    setReadOut(null);
    // Open his subject page first, so there is something to point at. The skill
    // list shows every SmartScore in brackets.
    if (chunk.practiceUrl) window.open(chunk.practiceUrl, "_blank", "noopener");

    const media = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
    };
    if (!media?.getDisplayMedia) {
      setReadOut("This browser can't share a tab — your guide can check it instead.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await media.getDisplayMedia({ video: true });
      // One frame is all we want. Painting a <video> is the portable way to get
      // it — ImageCapture is Chromium-only.
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 400)); // let the tab actually paint
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (!canvas.width || !canvas.height) throw new Error("nothing to capture");
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      video.pause();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      await sendShot(dataUrl.split(",")[1], "image/jpeg");
    } catch {
      setReadOut("No problem — your guide can check your score instead.");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  }

  async function readScore(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    await sendShot(btoa(bin), file.type || "image/jpeg");
  }

  // The score lives on IXL's own screen. However the picture arrives — shared
  // tab or a photo — it is read here and parked on the pending row, so the
  // guide's check becomes one tap.
  async function sendShot(imageBase64: string, mimeType: string) {
    setReading(true);
    setReadOut(null);
    const d = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "readScore",
        childId,
        slotId,
        mimeType,
        imageBase64,
      }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setReading(false);
    if (!d?.ok || !d.read) {
      setReadOut(d?.reason ?? "I couldn't read that one — your guide can check it instead.");
      return;
    }
    setReadOut(
      d.smartScore >= 100
        ? `SmartScore ${d.smartScore} — you finished it! 🎉`
        : `SmartScore ${d.smartScore}. Saved for your guide to look at.`
    );
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
          {!preview && (
            <>
              <button
                className="btn quiet"
                style={{ marginTop: 4 }}
                onClick={grabFromIxl}
                disabled={reading}
              >
                {reading ? "Looking…" : "✨ Get my score from IXL"}
              </button>
              <p className="muted" style={{ fontSize: "0.8rem", margin: "6px 0 0" }}>
                Your score page opens, then choose that tab when your browser asks.
              </p>
              <button
                className="chip"
                style={{ marginTop: 6 }}
                onClick={() => shotRef.current?.click()}
                disabled={reading}
              >
                or send a picture
              </button>
              <input
                ref={shotRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readScore(f);
                  e.target.value = "";
                }}
              />
              {readOut && (
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
                  {readOut}
                </p>
              )}
            </>
          )}
          <button className="btn" style={{ marginTop: 8 }} onClick={onNext}>Next →</button>
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
