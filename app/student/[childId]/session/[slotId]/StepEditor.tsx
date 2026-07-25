"use client";

import { useRef, useState } from "react";
import type { Chunk } from "./player";

// Fixing a lesson from inside the preview, at the moment you notice the problem.
// Whatever the guide saves here is what the child reads — no regeneration over
// the top of it.

export default function StepEditor({
  planId,
  index,
  chunk,
  currentText,
  onSaved,
  onClose,
}: {
  planId: string;
  index: number;
  chunk: Chunk;
  /** What the player is showing right now — usually the tutor's generated words. */
  currentText: string;
  onSaved: (chunk: Chunk) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(chunk.verbatim ? (chunk.content ?? "") : currentText);
  const [videoUrl, setVideoUrl] = useState(chunk.videoUrl ?? "");
  const [imageAssetId, setImageAssetId] = useState(chunk.imageAssetId ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function rewrite(how: "shorter" | "simpler") {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "rewrite", text, how }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setNote(data.error ?? "That didn't work.");
      return;
    }
    setText(data.text);
    setNote("Rewritten — edit it further or save.");
  }

  async function addImage(file: File) {
    setBusy(true);
    setNote(null);
    const form = new FormData();
    form.append("planId", planId);
    form.append("file", file);
    const res = await fetch("/api/lessons", { method: "POST", body: form });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setNote(data.error ?? "That image didn't upload.");
      return;
    }
    setImageAssetId(data.assetId);
    setNote("Picture added. Save to keep it.");
  }

  async function save() {
    setBusy(true);
    setNote(null);
    const next: Chunk = {
      ...chunk,
      content: text,
      // The guide's words win from here on.
      verbatim: true,
      videoUrl: videoUrl.trim() || undefined,
      imageAssetId: imageAssetId || undefined,
    };
    const res = await fetch("/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "saveChunk", planId, index, chunk: next }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setNote(data.error ?? "Could not save.");
      return;
    }
    onSaved(next);
  }

  return (
    <div className="card step-editor">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Editing step {index + 1}</h2>
        <button className="chip" onClick={onClose} aria-label="Close editor">
          ✕
        </button>
      </div>

      <label className="lbl">What the child reads</label>
      <textarea className="field" rows={8} value={text} onChange={(e) => setText(e.target.value)} />

      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button className="chip" onClick={() => rewrite("shorter")} disabled={busy || !text.trim()}>
          ✂️ Make it shorter
        </button>
        <button className="chip" onClick={() => rewrite("simpler")} disabled={busy || !text.trim()}>
          Make it simpler
        </button>
        <button className="chip" onClick={() => fileRef.current?.click()} disabled={busy}>
          🖼 Add a picture
        </button>
      </div>

      {imageAssetId && (
        <div className="row" style={{ marginTop: 10, gap: 10, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="editor-thumb" src={`/api/asset/${imageAssetId}`} alt="Picture for this step" />
          <button className="chip danger" onClick={() => setImageAssetId("")}>
            Remove picture
          </button>
        </div>
      )}

      <label className="lbl">Video link (optional)</label>
      <input
        className="field"
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        placeholder="Paste a YouTube or Vimeo link"
      />

      <div className="row" style={{ marginTop: 14, gap: 12, alignItems: "center" }}>
        <button className="btn" onClick={save} disabled={busy || !text.trim()}>
          {busy ? "Saving…" : "Save this step"}
        </button>
        {note && <span className="muted">{note}</span>}
      </div>
      <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
        Saved words are used exactly as written — the tutor won&apos;t rewrite them for the child.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])}
      />
    </div>
  );
}
