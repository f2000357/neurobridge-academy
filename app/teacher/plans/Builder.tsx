"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStandards } from "@/lib/standards";
import Link from "next/link";

export type Chunk = {
  type: "read_text" | "visual" | "video" | "worksheet" | "wrap_up" | "practice";
  title: string;
  content?: string;
  visual?: string;
  videoNote?: string;
  items?: number;
  seed_question?: string;
  seed_answer?: string;
  read_aloud?: boolean;
  /** Use the content exactly as written — don't let the tutor rephrase it. */
  verbatim?: boolean;
  /** A picture the guide attached (LessonAsset id). */
  imageAssetId?: string;
  /** A video the guide added, by URL — becomes an embed for the child. */
  videoUrl?: string;
  /** Practice step: which external provider, and the deep link to its practice. */
  provider?: string; // ixl | khan
  practiceUrl?: string;
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

const STD = getStandards();

const CHUNK_LABEL: Record<Chunk["type"], string> = {
  read_text: "Read-aloud text",
  visual: "Visual",
  video: "Video",
  practice: "Practice (IXL / Khan)",
  worksheet: "Worksheet",
  wrap_up: "Wrap up",
};

// A small chip that opens the file dialog and hands back the chosen image.
function StepImagePicker({ onPick, disabled }: { onPick: (file: File) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="chip" onClick={() => ref.current?.click()} disabled={disabled}>
        🖼 Add a picture
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
    </>
  );
}

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

  // Make sure the lesson exists so an image can be attached to it. Returns its
  // id, saving a draft first for a brand-new lesson.
  async function ensureSaved(): Promise<string | null> {
    if (plan.id) return plan.id;
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", ...plan, published: plan.published }),
    });
    const data = await res.json();
    if (data.ok && data.id) {
      setPlan((p) => ({ ...p, id: data.id }));
      return data.id;
    }
    setNote(data.error ?? "Could not save the lesson.");
    return null;
  }

  // "Make this shorter / simpler" on a step's text — same as in the preview.
  async function rewriteChunk(i: number, how: "shorter" | "simpler") {
    const text = plan.chunks[i].content ?? "";
    if (!text.trim()) {
      setNote("There's no text on that step to rewrite yet.");
      return;
    }
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "rewrite", text, how }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setNote(data.error ?? "That rewrite didn't work.");
      return;
    }
    // A rewrite is the guide's words now — keep them verbatim.
    setChunk(i, { content: data.text, verbatim: true });
    setNote("Rewritten. Edit it further or save.");
  }

  async function uploadImage(i: number, file: File) {
    setBusy(true);
    setNote(null);
    const planId = await ensureSaved();
    if (!planId) {
      setBusy(false);
      return;
    }
    const form = new FormData();
    form.append("planId", planId);
    form.append("file", file);
    const res = await fetch("/api/lessons", { method: "POST", body: form });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setNote(data.error ?? "That image didn't upload.");
      return;
    }
    setChunk(i, { imageAssetId: data.assetId });
    setNote("Picture added. Save the lesson to keep it.");
  }

  function addChunk(type: Chunk["type"]) {
    const base: Chunk =
      type === "worksheet"
        ? { type, title: "Practice", items: 3 }
        : type === "wrap_up"
          ? { type, title: "Look what you did" }
          : type === "practice"
            ? { type, title: "Practice this skill", provider: "khan", videoUrl: "", practiceUrl: "" }
            : { type, title: CHUNK_LABEL[type], content: "" };
    setPlan((p) => ({ ...p, chunks: [...p.chunks, base] }));
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

      {/* Lesson details */}
      <div className="card lift" style={{ marginTop: 16 }}>
        <h2>Lesson details</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Set the subject, grade, and standard. Add the steps below — including a Practice step that deep-links to IXL or Khan.
        </p>
        <div className="stack">
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
                {STD.subjects.map((s) => (
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
                {STD.grades.map((g) => (
                  <option key={g} value={g}>
                    {STD.gradeLabel(g)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label className="inline muted">
              {STD.label} strand
              <select
                className="field short"
                value={plan.topic}
                onChange={(e) => set("topic", e.target.value)}
                aria-label="Curriculum strand"
              >
                <option value="">Any strand</option>
                {STD.topicsFor(plan.subject, plan.gradeLevel).map((t) => (
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
            {STD.label} code
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
              <>
                <textarea
                  className="field"
                  rows={3}
                  value={c.content ?? ""}
                  onChange={(e) => setChunk(i, { content: e.target.value, verbatim: false })}
                  placeholder={c.type === "visual" ? "Describe the picture or diagram" : "The text to read"}
                />
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <button className="chip" onClick={() => rewriteChunk(i, "shorter")} disabled={busy}>
                    ✂️ Make it shorter
                  </button>
                  <button className="chip" onClick={() => rewriteChunk(i, "simpler")} disabled={busy}>
                    Make it simpler
                  </button>
                  <StepImagePicker onPick={(file) => uploadImage(i, file)} disabled={busy} />
                  <label className="inline muted" style={{ fontSize: "0.82rem" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(c.verbatim)}
                      onChange={(e) => setChunk(i, { verbatim: e.target.checked })}
                    />
                    Use my exact words
                  </label>
                </div>
                {c.imageAssetId && (
                  <div className="row" style={{ marginTop: 10, gap: 10, alignItems: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="editor-thumb" src={`/api/asset/${c.imageAssetId}`} alt="Picture for this step" />
                    <button className="chip danger" onClick={() => setChunk(i, { imageAssetId: undefined })}>
                      Remove picture
                    </button>
                  </div>
                )}
                <input
                  className="field"
                  style={{ marginTop: 8 }}
                  value={c.videoUrl ?? ""}
                  onChange={(e) => setChunk(i, { videoUrl: e.target.value })}
                  placeholder="Video link (optional — YouTube or Vimeo)"
                />
              </>
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
                  value={c.videoUrl ?? ""}
                  onChange={(e) => setChunk(i, { videoUrl: e.target.value })}
                  placeholder="Paste video URL (YouTube or Vimeo)"
                />
              </>
            )}
            {c.type === "practice" && (
              <>
                <div className="row">
                  <label className="inline muted">
                    Provider
                    <select
                      className="field short"
                      value={c.provider ?? "khan"}
                      onChange={(e) => setChunk(i, { provider: e.target.value })}
                    >
                      <option value="khan">Khan Academy</option>
                      <option value="ixl">IXL</option>
                    </select>
                  </label>
                </div>
                <input
                  className="field"
                  value={c.videoUrl ?? ""}
                  onChange={(e) => setChunk(i, { videoUrl: e.target.value })}
                  placeholder="Video deep link (opens the provider — not embedded)"
                />
                <input
                  className="field"
                  value={c.practiceUrl ?? ""}
                  onChange={(e) => setChunk(i, { practiceUrl: e.target.value })}
                  placeholder="Practice / skill deep link"
                />
                <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                  The child opens these on {c.provider === "ixl" ? "IXL" : "Khan Academy"} and comes back — content isn&apos;t embedded (licensing).
                </p>
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
        {(["read_text", "visual", "video", "practice", "worksheet", "wrap_up"] as const).map((t) => (
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
                setNote("Submitted for the global shelf — a NeuroBridge admin will review it.");
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
