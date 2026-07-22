"use client";

import { useState } from "react";

type Narrative = {
  overview: string;
  strengths: string[];
  growthAreas: string[];
  nextSteps: string[];
};

export default function ReportNarrative({
  childId,
  childName,
  range,
}: {
  childId: string;
  childName: string;
  range?: string;
}) {
  const [n, setN] = useState<Narrative | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, range }),
      });
      const data = await res.json();
      if (data.narrative) setN(data.narrative);
      else setErr(data.error || "Couldn't generate the summary.");
    } catch {
      setErr("Couldn't reach the report service.");
    }
    setBusy(false);
  }

  return (
    <section className="report-narrative">
      <div className="report-narrative-bar no-print">
        <button className="btn" onClick={generate} disabled={busy}>
          {busy ? "Writing…" : n ? "Regenerate summary" : "✦ Write summary with AI"}
        </button>
        {n && (
          <button className="btn quiet" onClick={() => window.print()}>
            ⎙ Print / Save PDF
          </button>
        )}
      </div>

      {err && (
        <p className="muted" role="status">
          {err}
        </p>
      )}

      {!n && !busy && !err && (
        <p className="muted report-narrative-hint">
          Generate a written summary of {childName}&apos;s progress, grounded in their recorded work —
          ready to read, print, or share.
        </p>
      )}

      {n && (
        <div className="report-summary">
          <h2 className="report-h2">Summary</h2>
          <p className="report-overview">{n.overview}</p>
          <div className="report-two">
            <div>
              <h3 className="report-h3">Strengths</h3>
              <ul className="report-ul">
                {n.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="report-h3">Areas to grow</h3>
              <ul className="report-ul">
                {n.growthAreas.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
          <h3 className="report-h3">Recommended next steps</h3>
          <ul className="report-ul">
            {n.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
