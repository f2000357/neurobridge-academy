"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SPECIALTIES, specialtyLabel } from "@/lib/specialists";

// Adding and assigning visiting specialists. Used by the guide, the centre and
// Neurable admin — the only difference is `canSeeCode`, which is Neurable admin
// only. Everyone else adds a teacher and the code goes to the teacher directly.

export type TeacherRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  archived: boolean;
  code?: string; // present only for Neurable admin
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
  const [form, setForm] = useState({ name: "", email: "", phone: "", specialty: "misc" });
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
    const data = await call({ op: "create", ...form });
    if (!data) return;
    setAdding(false);
    setForm({ name: "", email: "", phone: "", specialty: "misc" });
    setNote(
      data.existed
        ? `${data.teacher.name} already has a Neurable profile — assign them a learner below.`
        : `${data.teacher.name} added. Their code goes to them directly; nobody here sees it.`
    );
  }

  async function assign(teacherId: string) {
    if (!pick.childId) return;
    await call({ op: "assign", teacherId, childId: pick.childId, subject: pick.subject });
    setAssigning(null);
    setPick({ childId: "", subject: "" });
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
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>
            The email address is their identity. If they already teach elsewhere on Neurable, this
            adds them to your learner rather than making a second profile.
          </p>
          <button
            className="btn"
            style={{ marginTop: 8 }}
            onClick={addTeacher}
            disabled={busy || !form.name.trim() || !form.email.trim()}
          >
            Add teacher
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
                  <span className="pill" title="Only Neurable admin can read a teacher's code">
                    code held by Neurable
                  </span>
                )}
                <button className="chip" onClick={() => call({ op: "archive", teacherId: t.id, archived: true })}>
                  Archive
                </button>
              </div>
            </div>

            {!t.codeSent && (
              <p className="pill warn" style={{ marginTop: 8 }}>
                Code not sent yet — email and text delivery isn&apos;t built, so Neurable passes it on by
                hand.
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
