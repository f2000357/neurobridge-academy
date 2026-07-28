"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SPECIALTIES, specialtyLabel } from "@/lib/specialists";

// Adding and assigning visiting specialists. Used by the guide, the centre and
// NeuroBridge admin — the only difference is `canSeeCode`, which is NeuroBridge admin
// only. Everyone else adds a teacher and the code goes to the teacher directly.

export type TeacherRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  archived: boolean;
  code?: string; // present only for NeuroBridge admin
  codeSent: boolean;
  createdByName: string;
  assignments: { childId: string; childName: string; subject: string }[];
};

export type ChildOption = { id: string; name: string };

export default function SpecialistsPanel({
  teachers,
  children,
  canSeeCode = false,
}: {
  teachers: TeacherRow[];
  children: ChildOption[];
  canSeeCode?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", specialty: "misc", childId: "" });
  // Which teacher's "assign a learner" row is open.
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pick, setPick] = useState<{ childId: string; subject: string }>({ childId: "", subject: "" });
  const [revealed, setRevealed] = useState<string | null>(null);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/specialists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return null;
    }
    router.refresh();
    return data;
  }

  async function addTeacher() {
    const { childId, ...details } = form;
    const data = await call({ op: "create", ...details });
    if (!data) return;
    const who = data.teacher.name;

    // Adding and assigning are one action here on purpose. A teacher with no
    // learner can sign in to nothing and is never emailed, so leaving the two
    // steps separate strands them — which is exactly what used to happen.
    let tail: string;
    if (childId) {
      const res = await call({ op: "assign", teacherId: data.teacher.id, childId, subject: details.specialty });
      const child = children.find((c) => c.id === childId)?.name ?? "your learner";
      if (!res) tail = `but adding them to ${child} failed — try from their card below.`;
      else if (res.emailed) tail = `and emailed a sign-in link. They now see ${child}'s day.`;
      else if (res.link) tail = `and added to ${child}, but the email didn't go out — send them this link: ${res.link}`;
      else tail = `and added to ${child}.`;
    } else {
      tail = "but nobody has been contacted — give them a learner below and we'll email them their way in.";
    }

    setAdding(false);
    setForm({ name: "", email: "", phone: "", specialty: "misc", childId: "" });
    setNote(`${who} ${data.existed ? "already had a profile" : "added"} — ${tail}`);
  }

  async function assign(teacherId: string) {
    if (!pick.childId) return;
    const data = await call({ op: "assign", teacherId, childId: pick.childId, subject: pick.subject });
    setAssigning(null);
    setPick({ childId: "", subject: "" });
    if (!data) return;
    // Report what actually happened. A failed send is not silent, and the link
    // it hands back is the only way that teacher gets in.
    if (data.emailed) setNote("Assigned. We've emailed them a link to sign in.");
    else if (data.link) setNote(`Assigned, but the email didn't go out. Send them this link yourself: ${data.link}`);
    else setNote("Assigned.");
  }

  async function unassign(teacherId: string, childId: string, childName: string) {
    if (!confirm(`Remove this teacher from ${childName}? They keep the notes they wrote, but stop seeing them.`))
      return;
    await call({ op: "unassign", teacherId, childId });
  }

  const active = teachers.filter((t) => !t.archived);
  const archived = teachers.filter((t) => t.archived);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="muted" style={{ margin: 0 }}>
          A visiting teacher holds one code for all of their learners. Remove them from a learner and
          that child disappears from their list.
        </p>
        <button className="btn quiet" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "＋ Add a teacher"}
        </button>
      </div>

      {note && (
        <p className="muted" role="status" style={{ marginTop: 10 }}>
          {note}
        </p>
      )}

      {adding && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row">
            <label className="inline muted" style={{ flex: 1 }}>
              Name
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ravi Menon"
              />
            </label>
            <label className="inline muted" style={{ flex: 1 }}>
              Email
              <input
                className="field"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ravi@example.com"
              />
            </label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="inline muted" style={{ flex: 1 }}>
              Mobile (optional)
              <input
                className="field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="For the text message"
              />
            </label>
            <label className="inline muted" style={{ flex: 1 }}>
              Teaches
              <select
                className="field"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              >
                {SPECIALTIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="inline muted" style={{ flex: 1 }}>
              Which learner?
              <select
                className="field"
                value={form.childId}
                onChange={(e) => setForm({ ...form, childId: e.target.value })}
              >
                <option value="">Choose a learner…</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>
            The email address is their identity. If they already teach elsewhere on NeuroBridge, this
            adds them to your learner rather than making a second profile. Choosing a learner emails
            them a link to sign in — without one, they have nothing to see and hear nothing from us.
          </p>
          <button
            className="btn"
            style={{ marginTop: 8 }}
            onClick={addTeacher}
            disabled={busy || !form.name.trim() || !form.email.trim()}
          >
            {form.childId ? "Add teacher & send their link" : "Add teacher"}
          </button>
        </div>
      )}

      {active.length === 0 && !adding && (
        <p className="muted" style={{ marginTop: 16 }}>
          No visiting teachers yet.
        </p>
      )}

      <div className="stack" style={{ gap: 12, marginTop: 16 }}>
        {active.map((t) => (
          <div key={t.id} className="card spec-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span className="spec-name">{t.name}</span>
                <span className="muted"> · {specialtyLabel(t.specialty)}</span>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  {t.email}
                  {t.phone ? ` · ${t.phone}` : ""}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {canSeeCode ? (
                  <button
                    className="chip"
                    onClick={() => setRevealed(revealed === t.id ? null : t.id)}
                  >
                    {revealed === t.id ? t.code : "Reveal code"}
                  </button>
                ) : (
                  <span className="pill" title="Only NeuroBridge admin can read a teacher's code">
                    code held by NeuroBridge
                  </span>
                )}
                <button className="chip" onClick={() => call({ op: "archive", teacherId: t.id, archived: true })}>
                  Archive
                </button>
              </div>
            </div>

            {!t.codeSent && t.assignments.length === 0 && (
              <p className="pill warn" style={{ marginTop: 8 }}>
                Not contacted yet — assign them a learner below and we&apos;ll email them a link to sign in.
              </p>
            )}

            <div className="stack" style={{ gap: 6, marginTop: 10 }}>
              {t.assignments.length === 0 ? (
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  No learners assigned — they can sign in but will see nothing.
                </span>
              ) : (
                t.assignments.map((a) => (
                  <div key={a.childId} className="row assign-row">
                    <span>{a.childName}</span>
                    <span className="muted">{specialtyLabel(a.subject || t.specialty)}</span>
                    <button
                      className="chip danger"
                      onClick={() => unassign(t.id, a.childId, a.childName)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            {assigning === t.id ? (
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <select
                  className="field short"
                  value={pick.childId}
                  onChange={(e) => setPick({ ...pick, childId: e.target.value })}
                >
                  <option value="">Choose a learner…</option>
                  {children
                    .filter((c) => !t.assignments.some((a) => a.childId === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <select
                  className="field short"
                  value={pick.subject}
                  onChange={(e) => setPick({ ...pick, subject: e.target.value })}
                >
                  <option value="">Same as their specialty</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.emoji} {s.label}
                    </option>
                  ))}
                </select>
                <button className="btn quiet" onClick={() => assign(t.id)} disabled={busy || !pick.childId}>
                  Assign
                </button>
                <button className="chip" onClick={() => setAssigning(null)}>
                  ✕
                </button>
              </div>
            ) : (
              <button className="chip" style={{ marginTop: 10 }} onClick={() => setAssigning(t.id)}>
                ＋ Assign a learner
              </button>
            )}
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <h3 style={{ marginTop: 26 }}>Archived</h3>
          <div className="stack" style={{ gap: 8 }}>
            {archived.map((t) => (
              <div key={t.id} className="row assign-row">
                <span className="muted">
                  {t.name} · {t.email}
                </span>
                <button className="chip" onClick={() => call({ op: "archive", teacherId: t.id, archived: false })}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
