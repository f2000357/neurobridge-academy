"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GRADES, SUBJECTS, gradeLabel, topicsFor } from "@/lib/njsls";

export type Chunk = {
  type: "read_text" | "visual" | "video" | "worksheet" | "wrap_up";
  title: string;
  content?: string;
  visual?: string;
  videoNote?: string;
  items?: number;
  seed_question?: string;
  seed_answer?: string;
  read_aloud?: boolean;
};

export type PlanState = {
  id?: string;
  title: string;
  subject: string;
  gradeLevel: string;
  topic: string;
  standardCode: string;
  standardText: string;
  goal: string;
  whyItMatters: string;
  workUrl: string;
  durationMin: number;
  childId: string | null;
  published: boolean;
  visibility: string; // private | center | global
  chunks: Chunk[];
};

const CHUNK_LABEL: Record<Chunk["type"], string> = {
  read_text: "Read-aloud text",
  visual: "Visual",
  video: "Video",
  worksheet: "Worksheet",
  wrap_up: "Wrap up",
};

export default function Builder({
  initial,
  children,
  canGlobal = false,
}: {
  initial: PlanState;
  children: { id: string; name: string }[];
  canGlobal?: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanState>(initial);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function set<K extends keyof PlanState>(key: K, value: PlanState[K]) {
    setPlan((p) => ({ ...p, [key]: value }));
  }

  function setChunk(i: number, patch: Partial<Chunk>) {
    setPlan((p) => {
      const chunks = p.chunks.slice();
      chunks[i] = { ...chunks[i], ...patch };
      return { ...p, chunks };
    });
  }

  function moveChunk(i: number, dir: -1 | 1) {
    setPlan((p) => {
      const chunks = p.chunks.slice();
      const j = i + dir;
      if (j < 0 || j >= chunks.length) return p;
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
      return { ...p, chunks };
    });
  }

  function removeChunk(i: number) {
    setPlan((p) => ({ ...p, chunks: p.chunks.filter((_, k) => k !== i) }));
  }

  function addChunk(type: Chunk["type"]) {
    const base: Chunk =
      type === "worksheet"
        ? { type, title: "Practice", items: 3 }
        : type === "wrap_up"
          ? { type, title: "Look what you did" }
          : { type, title: CHUNK_LABEL[type], content: "" };
    setPlan((p) => ({ ...p, chunks: [...p.chunks, base] }));
  }

  async function generate() {
    if (!topic.trim()) {
      setNote("Tell me the topic first — even a rough phrase is fine.");
      return;
    }
    setBusy(true);
    setNote("Drafting a lesson… this uses the stronger model, so give it a moment.");
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "generate",
        topic,
        subject: plan.subject || "General",
        durationMin: plan.durationMin,
        childId: plan.childId,
        gradeLevel: plan.gradeLevel,
        curriculumTopic: plan.topic,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setPlan((p) => ({
      ...p,
      title: data.title ?? p.title,
      goal: data.goal ?? p.goal,
      whyItMatters: data.whyItMatters ?? p.whyItMatters,
      standardCode: data.standardCode ?? p.standardCode,
      standardText: data.standardText ?? p.standardText,
      chunks: Array.isArray(data.chunks) ? data.chunks : p.chunks,
    }));
    setNote(
      data.standardCode
        ? `Draft ready, aligned to NJSLS ${data.standardCode}. Read it over, edit anything, then save.`
        : "Draft ready. Read it over, edit anything, then save."
    );
  }

  async function save(publish: boolean) {
    if (!plan.title.trim()) {
      setNote("Give the lesson a title before saving.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", ...plan, published: publish }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      router.push("/teacher");
      router.refresh();
    } else {
      setNote(data.error ?? "Could not save.");
    }
  }

  // Save the current edits (keeping draft/published state) then open the preview.
  async function saveAndPreview() {
    if (plan.chunks.length === 0) {
      setNote("Add at least one step before previewing.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", ...plan, published: plan.published }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok && data.id) {
      router.push(`/preview/${data.id}`);
    } else {
      setNote(data.error ?? "Could not open the preview.");
    }
  }

  return (
    <main className="page wrap" style={{ maxWidth: 780 }}>
      <p className="eyebrow">Lesson builder</p>
      <h1>{plan.id ? "Edit lesson" : "New lesson"}</h1>

      {/* Draft-with-AI starter */}
      <div className="card lift" style={{ marginTop: 16 }}>
        <h2>Start with a rough idea</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Describe the lesson in a sentence. The AI drafts the steps; you stay in control and edit.
        </p>
        <div className="stack">
          <textarea
            className="field"
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Intro to telling time on an analog clock, to the half hour"
          />
          <div className="row">
            <label className="inline muted">
              Subject
              <select
                className="field short"
                value={plan.subject}
                onChange={(e) => {
                  set("subject", e.target.value);
                  set("topic", "");
                }}
                aria-label="Subject"
              >
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline muted">
              Grade
              <select
                className="field short"
                value={plan.gradeLevel}
                onChange={(e) => set("gradeLevel", e.target.value)}
                aria-label="Grade"
              >
                <option value="">Any grade</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {gradeLabel(g)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label className="inline muted">
              NJSLS strand
              <select
                className="field short"
                value={plan.topic}
                onChange={(e) => set("topic", e.target.value)}
                aria-label="Curriculum strand"
              >
                <option value="">Any strand</option>
                {topicsFor(plan.subject, plan.gradeLevel).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline muted">
              Minutes
              <input
                className="field tiny"
                type="number"
                min={5}
                max={90}
                value={plan.durationMin}
                onChange={(e) => set("durationMin", Number(e.target.value))}
              />
            </label>
            <select
              className="field short"
              value={plan.childId ?? ""}
              onChange={(e) => set("childId", e.target.value || null)}
              aria-label="Customize for a child"
            >
              <option value="">For any student</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  For {c.name}
                </option>
              ))}
            </select>
            <button className="btn" onClick={generate} disabled={busy}>
              {busy ? "Working…" : "✦ Draft with AI"}
            </button>
          </div>
        </div>
      </div>

      {note && (
        <p className="muted" style={{ marginTop: 12 }} role="status">
          {note}
        </p>
      )}

      {/* The plan itself */}
      <div className="card" style={{ marginTop: 20 }}>
        <label className="lbl">Title</label>
        <input className="field" value={plan.title} onChange={(e) => set("title", e.target.value)} />
        <label className="lbl">Goal — one thing they'll be able to do</label>
        <input className="field" value={plan.goal} onChange={(e) => set("goal", e.target.value)} />
        <label className="lbl">Why it matters (a child-friendly sentence)</label>
        <input
          className="field"
          value={plan.whyItMatters}
          onChange={(e) => set("whyItMatters", e.target.value)}
        />
        <label className="lbl">Practice link (optional — e.g. an IXL skill URL)</label>
        <input
          className="field"
          type="url"
          value={plan.workUrl}
          onChange={(e) => set("workUrl", e.target.value)}
          placeholder="https://www.ixl.com/math/grade-3/…"
        />
        <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
          <label className="inline muted" style={{ flex: "0 0 auto" }}>
            NJSLS code
            <input
              className="field tiny"
              style={{ width: 120 }}
              value={plan.standardCode}
              onChange={(e) => set("standardCode", e.target.value)}
              placeholder="3.NF.A.1"
            />
          </label>
          <label className="inline muted" style={{ flex: 1 }}>
            Standard
            <input
              className="field"
              value={plan.standardText}
              onChange={(e) => set("standardText", e.target.value)}
              placeholder="What the standard says, in plain words"
            />
          </label>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Steps</h2>
      <div className="stack">
        {plan.chunks.map((c, i) => (
          <div key={i} className="card chunk">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="badge next">{CHUNK_LABEL[c.type]}</span>
              <span className="row" style={{ gap: 6 }}>
                <button className="chip" onClick={() => moveChunk(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button
                  className="chip"
                  onClick={() => moveChunk(i, 1)}
                  disabled={i === plan.chunks.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button className="chip" onClick={() => removeChunk(i)} aria-label="Remove step">
                  ✕
                </button>
              </span>
            </div>
            <input
              className="field"
              value={c.title}
              onChange={(e) => setChunk(i, { title: e.target.value })}
              placeholder="Step title"
            />
            {(c.type === "read_text" || c.type === "visual") && (
              <textarea
                className="field"
                rows={3}
                value={c.content ?? ""}
                onChange={(e) => setChunk(i, { content: e.target.value })}
                placeholder={c.type === "visual" ? "Describe the picture or diagram" : "The text to read"}
              />
            )}
            {c.type === "video" && (
              <>
                <textarea
                  className="field"
                  rows={2}
                  value={c.videoNote ?? ""}
                  onChange={(e) => setChunk(i, { videoNote: e.target.value })}
                  placeholder="What video to find"
                />
                <input
                  className="field"
                  value={c.content ?? ""}
                  onChange={(e) => setChunk(i, { content: e.target.value })}
                  placeholder="Paste video URL (optional)"
                />
              </>
            )}
            {c.type === "worksheet" && (
              <div className="row">
                <label className="inline muted">
                  Questions
                  <input
                    className="field tiny"
                    type="number"
                    min={1}
                    max={8}
                    value={c.items ?? 3}
                    onChange={(e) => setChunk(i, { items: Number(e.target.value) })}
                  />
                </label>
                <input
                  className="field"
                  value={c.seed_question ?? ""}
                  onChange={(e) => setChunk(i, { seed_question: e.target.value })}
                  placeholder="First question (optional)"
                />
                <input
                  className="field short"
                  value={c.seed_answer ?? ""}
                  onChange={(e) => setChunk(i, { seed_answer: e.target.value })}
                  placeholder="Answer"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          Add a step:
        </span>
        {(["read_text", "visual", "video", "worksheet", "wrap_up"] as const).map((t) => (
          <button key={t} className="chip" onClick={() => addChunk(t)}>
            + {CHUNK_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <label className="inline muted" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ color: "var(--ink)" }}>Sharing</strong>
          <select
            className="field short"
            value={plan.visibility}
            onChange={(e) => set("visibility", e.target.value)}
          >
            <option value="private">Private — just my learners</option>
            <option value="center">My center — guides here can add a copy</option>
            {canGlobal && <option value="global">Global — every center</option>}
          </select>
          {!canGlobal && plan.id && plan.visibility !== "global" && (
            <button
              className="chip"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await fetch("/api/lessons", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ op: "submitForGlobal", planId: plan.id }),
                });
                setBusy(false);
                setNote("Submitted for the global shelf — a Neurable admin will review it.");
                set("visibility", plan.visibility === "private" ? "center" : plan.visibility);
              }}
            >
              ⤴ Submit for global review
            </button>
          )}
        </label>
      </div>

      <div className="row" style={{ marginTop: 20, gap: 12 }}>
        <button className="btn" onClick={() => save(true)} disabled={busy}>
          {plan.published ? "Save (published)" : "Publish to student"}
        </button>
        <button className="btn quiet" onClick={() => save(false)} disabled={busy}>
          Save as draft
        </button>
        <button className="btn quiet" onClick={saveAndPreview} disabled={busy}>
          ▶ Preview
        </button>
        <Link className="btn quiet" href="/teacher">
          Cancel
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: "0.82rem" }}>
        Preview runs the lesson exactly as a student sees it — grounding, teaching, and worksheet —
        and records nothing. It saves your current edits first.
      </p>
    </main>
  );
}
