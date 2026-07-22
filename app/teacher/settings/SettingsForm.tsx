"use client";

import { useState } from "react";

export default function SettingsForm({ ixlUrl }: { ixlUrl: string }) {
  const [url, setUrl] = useState(ixlUrl);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ixlUrl: url }),
    });
    setBusy(false);
    setNote(res.ok ? "Saved." : "Couldn't save — try again.");
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <label className="lbl">Your IXL account link</label>
      <input
        className="field"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.ixl.com/profile/…"
      />
      <p className="muted" style={{ fontSize: "0.82rem", margin: "8px 0 14px" }}>
        Paste a lesson&apos;s specific practice link when you build it — this is just your account
        for quick reference.
      </p>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {url && (
          <a className="btn quiet" href={url} target="_blank" rel="noopener noreferrer">
            Open IXL ↗
          </a>
        )}
        {note && (
          <span className="muted" role="status">
            {note}
          </span>
        )}
      </div>
    </div>
  );
}
