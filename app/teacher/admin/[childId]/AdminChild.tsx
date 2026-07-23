"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gradeLabelShort } from "@/lib/map";
import { getStandards } from "@/lib/standards";
import InterestBlocks, { type InterestRow } from "./InterestBlocks";

export type ChildForm = {
  childId: string;
  username: string;
  name: string;
  age: number | null;
  interests: string;
  notes: string;
  accessCode: string;
};

export type DocMeta = { id: string; filename: string; kind: string; mimeType: string };

export type ProposedLesson = {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  title: string;
  rationale: string;
  status: string;
  source: string;
  lessonPlanId: string | null;
};
export type Proposal = { id: string; summary: string; lessons: ProposedLesson[] };
export type HwRow = { id: string; title: string; dueDate: string; status: string; score: number | null };

const KIND_LABEL: Record<string, string> = {
  iep: "IEP",
  strengths: "Strengths",
  evaluation: "Evaluation",
  external_report: "IXL / external report",
  other: "Other",
};

export default function AdminChild({
  initial,
  documents,
  proposal,
  homework = [],
  interestBlocks = [],
}: {
  initial: ChildForm;
  documents: DocMeta[];
  proposal: Proposal | null;
  homework?: HwRow[];
  interestBlocks?: InterestRow[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ChildForm>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [uploadKind, setUploadKind] = useState("iep");
  const fileRef = useRef<HTMLInputElement>(null);
  // Track per-lesson pending action so buttons disable while working.
  const [acting, setActing] = useState<string | null>(null);

  function set<K extends keyof ChildForm>(key: K, value: ChildForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const [copied, setCopied] = useState(false);
  const handle = form.username || form.childId;
  const link = typeof window !== "undefined" ? `${window.location.origin}/student/${handle}` : "";

  async function save() {
    setBusy(true);
    setNote(null);
    await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", ...form }),
    });
    setBusy(false);
    setNote("Saved.");
    router.refresh();
  }

  async function regenerateCode() {
    if (!confirm("Make a new code? The child will need the new one to sign in.")) return;
    setBusy(true);
    await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "regenerateCode", childId: form.childId }),
    });
    setBusy(false);
    router.refresh();
  }

  function copyLink() {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function upload(files: FileList) {
    setBusy(true);
    setNote(null);
    const fd = new FormData();
    fd.append("childId", form.childId);
    fd.append("kind", uploadKind);
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch("/api/child/upload", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (data.error) {
      setNote(data.error);
      return;
    }
    router.refresh();
  }

  async function removeDoc(documentId: string) {
    await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "removeDocument", documentId }),
    });
    router.refresh();
  }

  async function generateProgram() {
    setGenBusy(true);
    setNote(null);
    // Save notes/interests first so the AI uses the latest context.
    await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", ...form }),
    });
    const res = await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "generateProgram", childId: form.childId }),
    });
    const data = await res.json();
    setGenBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    router.refresh();
  }

  async function decide(proposedLessonId: string, approve: boolean) {
    setActing(proposedLessonId);
    await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: approve ? "approveLesson" : "rejectLesson", proposedLessonId }),
    });
    setActing(null);
    router.refresh();
  }

  const pending = proposal?.lessons.filter((l) => l.status === "pending") ?? [];
  const decided = proposal?.lessons.filter((l) => l.status !== "pending") ?? [];

  return (
    <main className="page" style={{ maxWidth: 820 }}>
      <p className="eyebrow">
        <Link href="/teacher/admin">Setup</Link> · Child profile
      </p>
      <h1>{form.name || "Child"}</h1>

      {/* Identity */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2>About</h2>
        <div className="row">
          <label className="inline muted" style={{ flex: 1 }}>
            Name
            <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="inline muted">
            Age
            <input
              className="field tiny"
              type="number"
              min={3}
              max={21}
              value={form.age ?? ""}
              onChange={(e) => set("age", e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
        </div>
        <label className="lbl">Interests (used to personalize examples)</label>
        <input
          className="field"
          value={form.interests}
          onChange={(e) => set("interests", e.target.value)}
          placeholder="trains, space, Minecraft"
        />
        <label className="lbl">Notes (optional)</label>
        <textarea
          className="field"
          rows={2}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything else that helps the AI understand this child."
        />
        <div style={{ marginTop: 12 }}>
          <button className="btn quiet" onClick={save} disabled={busy}>
            Save details
          </button>
        </div>
      </div>

      <InterestBlocks
        childId={form.childId}
        childName={form.name}
        initial={interestBlocks}
      />

      {/* Child's private sign-in */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>{form.name}&apos;s link &amp; code</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Give {form.name} this link and their 8-digit code. They enter the code once on their device
          to open their work.
        </p>
        <label className="lbl">Their link</label>
        <div className="row">
          <input className="field" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn quiet" onClick={copyLink}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <label className="lbl">Their 8-digit code</label>
        <div className="row">
          <span className="access-code">{form.accessCode || "—"}</span>
          <button className="btn quiet" onClick={regenerateCode} disabled={busy}>
            New code
          </button>
        </div>
      </div>

      {/* Documents */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Documents</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload an IEP, an evaluation, a list of strengths — anything about {form.name || "this child"}.
          The AI reads them to build the program. PDF, image, or text, up to 8&nbsp;MB each.
        </p>

        {documents.length > 0 && (
          <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
            {documents.map((d) => (
              <div key={d.id} className="row doc-row" style={{ justifyContent: "space-between" }}>
                <span>
                  <span className="pill good" style={{ marginRight: 8 }}>
                    {KIND_LABEL[d.kind] ?? d.kind}
                  </span>
                  {d.filename}
                </span>
                <button className="chip" onClick={() => removeDoc(d.id)} aria-label="Remove document">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="row">
          <label className="inline muted">
            This is a
            <select className="field short" value={uploadKind} onChange={(e) => setUploadKind(e.target.value)}>
              <option value="iep">IEP</option>
              <option value="strengths">Strengths list</option>
              <option value="evaluation">Evaluation</option>
              <option value="external_report">IXL / external report</option>
              <option value="other">Other</option>
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,application/pdf,image/*,text/plain"
            onChange={(e) => e.target.files && e.target.files.length > 0 && upload(e.target.files)}
            disabled={busy}
            aria-label="Upload documents"
          />
        </div>
      </div>

      {/* Generate program */}
      <div className="row" style={{ marginTop: 16, gap: 10, alignItems: "center" }}>
        <button className="btn" onClick={generateProgram} disabled={genBusy || documents.length === 0}>
          {genBusy ? "Reading the documents…" : "✦ Generate a program from the documents"}
        </button>
        {documents.length === 0 && (
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Upload a document first.
          </span>
        )}
      </div>
      {note && (
        <p className="muted" role="status" style={{ marginTop: 10 }}>
          {note}
        </p>
      )}

      {/* Proposal review */}
      {proposal && (
        <section style={{ marginTop: 28 }}>
          <h2>Proposed program for {form.name}</h2>
          {proposal.summary && (
            <p className="muted" style={{ marginTop: 0 }}>
              {proposal.summary}
            </p>
          )}

          {pending.length > 0 && (
            <div className="stack">
              {pending.map((l) => (
                <div key={l.id} className={`card ${l.source === "advancement" ? "advance-card" : ""}`}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      {l.source === "advancement" && <span className="pill good" style={{ marginRight: 8 }}>⬆ Next level</span>}
                      {l.title}
                    </strong>
                    <span className="pill warn">
                      {l.subject}
                      {l.grade ? ` · ${gradeLabelShort(l.grade)}` : ""}
                    </span>
                  </div>
                  {l.topic && (
                    <p className="muted" style={{ fontSize: "0.82rem", margin: "4px 0 0" }}>
                      {getStandards().label} strand: {l.topic}
                    </p>
                  )}
                  <p style={{ fontSize: "0.9rem", margin: "8px 0 12px" }}>{l.rationale}</p>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn" onClick={() => decide(l.id, true)} disabled={acting === l.id}>
                      {acting === l.id ? "Approving…" : "Approve"}
                    </button>
                    <button className="btn quiet" onClick={() => decide(l.id, false)} disabled={acting === l.id}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {decided.length > 0 && (
            <div style={{ marginTop: pending.length ? 20 : 0 }}>
              <h2 style={{ fontSize: "1rem" }}>Decided</h2>
              <div className="stack" style={{ gap: 8 }}>
                {decided.map((l) => (
                  <div key={l.id} className="row doc-row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {l.status === "approved" ? "✓ " : "✕ "}
                      {l.title}{" "}
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        — {l.subject}
                        {l.grade ? ` · ${gradeLabelShort(l.grade)}` : ""}
                      </span>
                    </span>
                    {l.status === "approved" && l.lessonPlanId ? (
                      <Link className="chip" href={`/teacher/plans/${l.lessonPlanId}`}>
                        Open lesson →
                      </Link>
                    ) : (
                      <span className="pill crit">rejected</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && decided.length === proposal.lessons.length && (
            <p className="muted" style={{ marginTop: 14, fontSize: "0.9rem" }}>
              You&apos;ve reviewed the whole program. Approved lessons are in your library as drafts —
              open them to publish and schedule.
            </p>
          )}
        </section>
      )}

      {/* Homework folder */}
      <section style={{ marginTop: 28 }}>
        <h2>📁 Homework</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          A 10-question worksheet is created automatically when {form.name} masters a skill, due the next Monday.
        </p>
        {homework.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.9rem" }}>No homework yet.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {homework.map((h) => (
              <div key={h.id} className="row doc-row" style={{ justifyContent: "space-between" }}>
                <span>
                  {h.title}
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {" "}
                    · due {h.dueDate}
                  </span>
                </span>
                {h.status === "completed" ? (
                  <span className="pill good">done · {h.score}%</span>
                ) : (
                  <span className="pill warn">assigned</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
