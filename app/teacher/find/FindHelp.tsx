"use client";

import { useState } from "react";
import { SPECIALTIES, specialtyLabel } from "@/lib/specialists";

// Finding a therapist.
//
// The scarce information isn't who exists — it's who has space. So availability
// leads, and anyone taking clients sorts first.
//
// There is deliberately no rating, no review, and no count of families. Any of
// those would either expose who a therapist works with, or make NeuroBridge a
// voucher for someone it has never met. What a parent gets is the therapist's
// own words and a number to call — the same as word of mouth, minus the luck.

type Row = {
  id: string;
  name: string;
  specialty: string;
  credentials: string;
  town: string;
  region: string;
  telehealth: boolean;
  agesServed: string;
  blurb: string;
  takingClients: boolean;
  availableAt: string | null;
  phone: string;
  email: string;
};

/** "3 weeks ago" — so a stale answer reads as stale rather than as fact. */
function since(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 1) return "today";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export default function FindHelp() {
  const [specialty, setSpecialty] = useState("");
  const [town, setTown] = useState("");
  const [telehealth, setTelehealth] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "search", specialty, town, telehealth }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.error) return setError(d.error);
    setRows(d.results);
  }

  return (
    <>
      <form className="card" style={{ marginTop: 14 }} onSubmit={search}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="inline muted" style={{ flex: "1 1 180px" }}>
            What do you need?
            <select
              className="field"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              <option value="">Anything</option>
              {SPECIALTIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline muted" style={{ flex: "1 1 160px" }}>
            Town
            <input
              className="field"
              value={town}
              placeholder="Somerset"
              onChange={(e) => setTown(e.target.value)}
            />
          </label>
          <label
            className="inline muted"
            style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingBottom: 10 }}
          >
            <input
              type="checkbox"
              checked={telehealth}
              onChange={(e) => setTelehealth(e.target.checked)}
            />
            Telehealth only
          </label>
          <button className="btn" disabled={busy}>
            {busy ? "Looking…" : "Search"}
          </button>
        </div>
      </form>

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--crit)" }}>
          {error}
        </p>
      )}

      {rows && (
        <>
          <p className="muted" style={{ fontSize: "0.88rem", marginTop: 18 }}>
            {rows.length === 0
              ? "Nobody listed matches that yet. Try a wider search — or ask your own therapist to list themselves."
              : `${rows.length} ${rows.length === 1 ? "person" : "people"}, whoever is taking clients first.`}
          </p>

          <div className="stack" style={{ gap: 12 }}>
            {rows.map((r) => (
              <div key={r.id} className="card dir-row">
                <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.05rem" }}>
                      {r.name}
                      {r.credentials && <span className="muted"> · {r.credentials}</span>}
                    </h3>
                    <p className="muted" style={{ margin: "3px 0 0", fontSize: "0.88rem" }}>
                      {specialtyLabel(r.specialty)} · {r.town}
                      {r.region ? `, ${r.region}` : ""}
                      {r.telehealth ? " · telehealth" : ""}
                      {r.agesServed ? ` · ages ${r.agesServed}` : ""}
                    </p>
                  </div>
                  <span className={`pill ${r.takingClients ? "good" : ""}`}>
                    {r.takingClients ? "Taking clients" : "Not taking clients"}
                  </span>
                </div>

                {r.blurb && (
                  <p style={{ fontSize: "0.93rem", margin: "12px 0 0" }}>{r.blurb}</p>
                )}

                <div className="row dir-contact">
                  {r.phone && (
                    <a className="btn quiet" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>
                      {r.phone}
                    </a>
                  )}
                  <a className="btn quiet" href={`mailto:${r.email}`}>
                    Email
                  </a>
                  {r.availableAt && (
                    <span className="muted" style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
                      availability updated {since(r.availableAt)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 22 }}>
        Everyone here chose to be listed and wrote their own description.{" "}
        <strong>NeuroBridge doesn&apos;t check credentials or vet anyone</strong> — please verify
        licences and references yourself, as you would with any provider.
      </p>
    </>
  );
}
