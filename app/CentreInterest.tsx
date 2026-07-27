"use client";

import { useState } from "react";

// "Bring a centre to my town."
//
// Four short fields, only two of them required. Every extra box on a form a
// stranger fills in for a thing that doesn't exist yet costs you people — so we
// ask for the least that still lets us reply and count the town.

export default function CentreInterest() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [town, setTown] = useState("");
  const [childAge, setChildAge] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — people never see this

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/centre-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, town, childAge, note, website }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setDone(true);
      }
    } catch {
      setError("That didn't send. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="lp-soon-cta lp-soon-done" role="status">
        <div>
          <h3>Thank you — that&apos;s noted.</h3>
          <p>
            We&apos;ll come back to you personally when there&apos;s a centre near {town || "you"},
            or sooner if we have questions. Nothing automated, no list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="lp-soon-cta lp-form" onSubmit={submit}>
      <div className="lp-form-intro">
        <h3>Bring a NeuroBridge centre to your town</h3>
        <p>
          We&apos;re looking for the first few towns with enough families to fill a room. Tell us
          where you are and we&apos;ll start there.
        </p>
      </div>

      <div className="lp-form-fields">
        <div className="lp-field-row">
          <label className="lp-field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="lp-field">
            <span>
              Email <b aria-hidden="true">*</b>
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        </div>

        <div className="lp-field-row">
          <label className="lp-field">
            <span>
              Town or city <b aria-hidden="true">*</b>
            </span>
            <input
              required
              value={town}
              onChange={(e) => setTown(e.target.value)}
              placeholder="Somerset, NJ"
            />
          </label>
          <label className="lp-field narrow">
            <span>Child&apos;s age</span>
            <input
              value={childAge}
              onChange={(e) => setChildAge(e.target.value)}
              placeholder="8"
              inputMode="numeric"
            />
          </label>
        </div>

        <label className="lp-field">
          <span>What would you want from a centre?</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — days you'd come, what your child would love, what would make it work for you."
          />
        </label>

        {/* Hidden from people, irresistible to bots. */}
        <input
          className="lp-hp"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />

        {error && (
          <p className="lp-form-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn big" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
        <p className="lp-form-fine">
          Goes straight to a person, not a mailing list. We only use it to reply.
        </p>
      </div>
    </form>
  );
}
