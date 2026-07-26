"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Three short steps: you, your child, and the plan. Nobody has to be invited and
// no centre is involved — a family can start on their own and stay that way.
export default function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");

  async function nextFromYou() {
    setError(null);
    if (!name.trim()) return setError("What should we call you?");
    if (!email.includes("@")) return setError("That email doesn't look right.");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    const r = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "checkEmail", email: email.trim() }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.taken) return setError("There's already an account with that email — sign in instead.");
    setStep(2);
  }

  async function finish() {
    setError(null);
    if (!childName.trim()) return setError("Add your child's name.");
    setBusy(true);
    const r = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "signup",
        name: name.trim(),
        email: email.trim(),
        password,
        childName: childName.trim(),
        childAge: childAge || null,
        gradeLevel,
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.error) return setError(d.error);
    router.push("/teacher");
    router.refresh();
  }

  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`pill ${step >= n ? "good" : ""}`}
            style={{ fontSize: "0.72rem" }}
          >
            {n === 1 ? "You" : n === 2 ? "Your child" : "Plan"}
          </span>
        ))}
      </div>

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--slot-break)", fontSize: "0.88rem" }}>
          {error}
        </p>
      )}

      {step === 1 && (
        <div className="stack">
          <label className="lbl">Your name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gayathri" />
          <label className="lbl">Email</label>
          <input
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label className="lbl">Password</label>
          <input
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
            onKeyDown={(e) => e.key === "Enter" && void nextFromYou()}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={nextFromYou} disabled={busy}>
              {busy ? "…" : "Continue"}
            </button>
            <Link className="btn quiet" href="/login">
              I already have an account
            </Link>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <label className="lbl">Your child&apos;s name</label>
          <input
            className="field"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="Meera"
          />
          <div className="row">
            <label className="inline muted">
              Age
              <input
                className="field tiny"
                type="number"
                min={3}
                max={21}
                value={childAge}
                onChange={(e) => setChildAge(e.target.value)}
              />
            </label>
            <label className="inline muted">
              Grade
              <select className="field short" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>
                <option value="">Not sure yet</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g === "K" ? "Kindergarten" : `Grade ${g}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
            The grade they&apos;re enrolled in. Lessons meet them where they are and work to close any
            gap — you can change this later.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn quiet" onClick={() => setStep(1)} disabled={busy}>
              Back
            </button>
            <button className="btn" onClick={() => setStep(3)} disabled={busy || !childName.trim()}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <div className="card" style={{ background: "var(--accent-soft)" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <strong>NeuroBridge</strong>
              <span style={{ fontSize: "1.4rem", fontWeight: 700 }}>Free</span>
            </div>
            <p className="muted" style={{ marginTop: 6, marginBottom: 0, fontSize: "0.88rem" }}>
              Everything included while we&apos;re building: the weekly plan, the IEP review, the
              schedule, and unlimited guides and therapists. No card needed.
            </p>
          </div>
          <p className="muted" style={{ fontSize: "0.82rem" }}>
            You can invite your partner or a guide once you&apos;re in, and join a learning centre
            later if you want to — neither is required.
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn quiet" onClick={() => setStep(2)} disabled={busy}>
              Back
            </button>
            <button className="btn" onClick={finish} disabled={busy}>
              {busy ? "Setting things up…" : `Start with ${childName.trim() || "my child"}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
