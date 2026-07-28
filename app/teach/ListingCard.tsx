"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SPECIALTIES } from "@/lib/specialists";

// The therapist's own listing.
//
// Asked once, at their first sign-in, and defaulting to NO. Their record was
// created by a parent typing in their name and number — so consent to appear in
// front of other families can only come from them, here.
//
// Everything shown to parents is what they type below. Nothing is derived from
// our data: no client counts, no ratings. In a town with one ABA provider a
// count starts identifying families, and a rating would make NeuroBridge a
// voucher for someone it has never met.

export type ListingState = {
  name: string;
  specialty: string;
  listed: boolean;
  asked: boolean;
  town: string;
  region: string;
  telehealth: boolean;
  credentials: string;
  agesServed: string;
  blurb: string;
  phone: string;
  takingClients: boolean;
  availableAt: string | null;
};

export default function ListingCard({ state }: { state: ListingState }) {
  const router = useRouter();
  const [open, setOpen] = useState(!state.asked); // first sign-in: ask straight away
  const [f, setF] = useState(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ListingState>(k: K, v: ListingState[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setBusy(false);
    if (d.error) {
      setError(d.error);
      return false;
    }
    router.refresh();
    return true;
  }

  // ── the ask, shown once ──────────────────────────────────────────────────
  if (!state.asked && !open) return null;

  if (!state.listed && !open) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          You&apos;re not listed in the family directory.{" "}
          <button className="linkish" onClick={() => setOpen(true)}>
            Change that
          </button>
        </p>
      </div>
    );
  }

  if (state.listed && !open) {
    const stale =
      state.availableAt &&
      Date.now() - new Date(state.availableAt).getTime() > 45 * 24 * 60 * 60 * 1000;
    return (
      <div className="card lift" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>You&apos;re in the family directory</h2>
            <p className="muted" style={{ margin: "3px 0 0", fontSize: "0.88rem" }}>
              Signed-in NeuroBridge families can find you. Never the open web.
            </p>
          </div>
          <span className={`pill ${state.takingClients ? "good" : ""}`}>
            {state.takingClients ? "Taking clients" : "Not taking clients"}
          </span>
        </div>

        {stale && (
          <p className="muted" style={{ fontSize: "0.86rem", marginBottom: 0 }}>
            Parents can see you last answered that a while ago. Still right?{" "}
            <button
              className="linkish"
              onClick={() => post({ op: "setAvailability", takingClients: state.takingClients })}
            >
              Yes, it&apos;s current
            </button>{" "}
            ·{" "}
            <button
              className="linkish"
              onClick={() => post({ op: "setAvailability", takingClients: !state.takingClients })}
            >
              No — I&apos;m {state.takingClients ? "full" : "open"} now
            </button>
          </p>
        )}

        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn quiet" onClick={() => setOpen(true)}>
            Edit my listing
          </button>
          <button
            className="btn quiet"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Remove your listing? Families will no longer find you here.")) return;
              await post({ op: "unlist" });
            }}
          >
            Remove me
          </button>
        </div>
      </div>
    );
  }

  // ── the form ─────────────────────────────────────────────────────────────
  return (
    <div className="card lift" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Can other families find you?</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.92rem" }}>
        Families on NeuroBridge often can&apos;t find anyone taking new clients. If you&apos;d like
        to be findable, fill this in — <strong>only signed-in families see it</strong>, never the
        open web, and we never show who you work with. You can remove yourself at any time.
      </p>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <label className="inline muted" style={{ flex: "1 1 180px" }}>
          What you do
          <select
            className="field"
            value={f.specialty}
            onChange={(e) => set("specialty", e.target.value)}
          >
            {SPECIALTIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline muted" style={{ flex: "1 1 150px" }}>
          Credentials
          <input
            className="field"
            value={f.credentials}
            placeholder="BCBA, MS OTR/L…"
            onChange={(e) => set("credentials", e.target.value)}
          />
        </label>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <label className="inline muted" style={{ flex: "2 1 160px" }}>
          Town <span style={{ color: "var(--crit)" }}>*</span>
          <input
            className="field"
            value={f.town}
            placeholder="Somerset"
            required
            aria-required="true"
            onChange={(e) => set("town", e.target.value)}
          />
        </label>
        <label className="inline muted" style={{ flex: "1 1 80px" }}>
          State
          <input
            className="field"
            value={f.region}
            placeholder="NJ"
            onChange={(e) => set("region", e.target.value)}
          />
        </label>
        <label className="inline muted" style={{ flex: "1 1 140px" }}>
          Ages you work with
          <input
            className="field"
            value={f.agesServed}
            placeholder="5–12"
            onChange={(e) => set("agesServed", e.target.value)}
          />
        </label>
      </div>

      <label className="inline muted" style={{ display: "block", marginTop: 10 }}>
        A phone number families can use
        <input
          className="field"
          type="tel"
          value={f.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </label>

      <label className="lbl" style={{ marginTop: 14 }}>
        A few lines, in your own words
      </label>
      <textarea
        className="field"
        rows={3}
        maxLength={500}
        value={f.blurb}
        placeholder="How you work, what you're good at, anything a parent should know before they call."
        onChange={(e) => set("blurb", e.target.value)}
      />

      <div className="row" style={{ gap: 16, marginTop: 14, flexWrap: "wrap" }}>
        <label className="inline muted" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={f.takingClients}
            onChange={(e) => set("takingClients", e.target.checked)}
          />
          I&apos;m taking new clients
        </label>
        <label className="inline muted" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={f.telehealth}
            onChange={(e) => set("telehealth", e.target.checked)}
          />
          I offer telehealth
        </label>
      </div>

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--crit)" }}>
          {error}
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            // Town is genuinely required — families search by it, so a listing
            // without one is never returned. This used to disable the button,
            // which just made it look broken: you clicked and nothing happened.
            if (!f.town.trim()) {
              setError("Add your town first — families search by town, so a listing without one never comes up.");
              return;
            }
            if (await post({ op: "setListing", ...f, listed: true })) setOpen(false);
          }}
        >
          {busy ? "Saving…" : "List me"}
        </button>
        <button
          className="btn quiet"
          disabled={busy}
          onClick={async () => {
            // Answering "no" is still an answer — recorded, so we stop asking.
            if (await post({ op: "setListing", listed: false })) setOpen(false);
          }}
        >
          {state.listed ? "Cancel" : "No thanks"}
        </button>
      </div>
    </div>
  );
}
