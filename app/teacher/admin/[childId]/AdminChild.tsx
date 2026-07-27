"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gradeLabelShort } from "@/lib/map";
import { getStandards } from "@/lib/standards";
import { subjectLabel } from "@/lib/subjects";
import { activeProviders, providerName, DEFAULT_PROVIDER } from "@/lib/providers";
import InterestBlocks, { type InterestRow } from "./InterestBlocks";
import Tests, { type TestRow } from "./Tests";
import People, { type PersonRow, type HistoryRow } from "./People";
import Profile, { type IntroData, type ContactData, EMPTY_CONTACT } from "./Profile";
import LearningProfile, { type ProfileData } from "./LearningProfile";
import { US_STATES, stateName } from "@/lib/usStates";
import { implementedStates } from "@/lib/standards";

const IMPLEMENTED = implementedStates();

export type ChildForm = {
  childId: string;
  username: string;
  name: string;
  age: number | null;
  gradeLevel: string; // enrolled grade — the target the plan works toward
  stateCode: string; // which state's standards apply
  interests: string;
  notes: string;
  accessCode: string;
  providers: string; // CSV of subscription ids the family holds (see lib/providers.ts)
};

export type DocMeta = { id: string; filename: string; kind: string; mimeType: string; createdAt: string };

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
};

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
export type LessonRow = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  standardCode: string;
  published: boolean;
};

const KIND_LABEL: Record<string, string> = {
  iep: "IEP",
  iep_progress: "IEP progress report",
  map: "MAP scores",
  evaluation: "Evaluation",
  strengths: "Strengths",
  external_report: "IXL / other report",
  other: "Other",
};

export type IepReviewData = {
  createdAt: string;
  docCount: number;
  standing: string;
  goals: { area: string; goal: string; status: string; evidence: string }[];
  goingWell: string[];
  concerns: string[];
  focus: string[];
  asks: { type: string; text: string; rationale: string }[];
} | null;

const statusPill = (s: string) => (s === "met" || s === "on_track" ? "good" : s === "stalled" ? "crit" : "warn");
const statusLabel = (s: string) =>
  ({ on_track: "On track", stalled: "Stalled", met: "Met", unclear: "Unclear" } as Record<string, string>)[s] ?? s;
const bullets = (items: string[]) => (
  <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem", lineHeight: 1.5 }}>
    {items.map((s, i) => (
      <li key={i}>{s}</li>
    ))}
  </ul>
);

export default function AdminChild({
  initial,
  documents,
  proposal,
  homework = [],
  lessons = [],
  lessonsTotal = 0,
  interestBlocks = [],
  iepReview = null,
  reviewsUsed = 0,
  isAdmin = false,
  tests = [],
  people = [],
  history = [],
  canManageAccess = false,
  meUserId = "",
  intro,
  canEditProfile = false,
  primaryGuideName = null,
  learningProfile = null,
  contact = EMPTY_CONTACT,
}: {
  initial: ChildForm;
  documents: DocMeta[];
  proposal: Proposal | null;
  homework?: HwRow[];
  lessons?: LessonRow[];
  lessonsTotal?: number;
  interestBlocks?: InterestRow[];
  iepReview?: IepReviewData;
  reviewsUsed?: number;
  isAdmin?: boolean;
  tests?: TestRow[];
  people?: PersonRow[];
  history?: HistoryRow[];
  canManageAccess?: boolean;
  meUserId?: string;
  intro: IntroData;
  canEditProfile?: boolean;
  primaryGuideName?: string | null;
  learningProfile?: ProfileData | null;
  contact?: ContactData;
}) {
  const REVIEW_CAP = 3;
  const router = useRouter();
  const [form, setForm] = useState<ChildForm>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [tab, setTab] = useState<"profile" | "standing" | "setup" | "iep" | "tests" | "lessons">("profile");
  const [uploadKind, setUploadKind] = useState("iep");
  const [review, setReview] = useState<IepReviewData>(iepReview);
  const [iepBusy, setIepBusy] = useState(false);
  // Which uploaded documents to feed the IEP review (default: all).
  const [selectedDocs, setSelectedDocs] = useState<string[]>(documents.map((d) => d.id));
  const toggleDoc = (id: string) =>
    setSelectedDocs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  // Lessons load a page at a time (newest-first) so a big library isn't dumped at once.
  const [lessonList, setLessonList] = useState<LessonRow[]>(lessons);
  const [lessonsMore, setLessonsMore] = useState(lessons.length < lessonsTotal);
  const [lessonsBusy, setLessonsBusy] = useState(false);
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

  // The family's subscriptions, as a list. Saved as a CSV on the child.
  const chosenProviders = form.providers
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  async function toggleProvider(id: string) {
    const next = chosenProviders.includes(id)
      ? chosenProviders.filter((p) => p !== id)
      : [...chosenProviders, id];
    const csv = next.join(",");
    set("providers", csv);
    setBusy(true);
    await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", ...form, providers: csv }),
    });
    setBusy(false);
    setNote(
      next.length
        ? `Subscriptions saved: ${next.map((p) => providerName(p)).join(", ")}.`
        : `No subscriptions — lessons default to ${providerName(DEFAULT_PROVIDER)}.`
    );
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

  async function loadMoreLessons() {
    setLessonsBusy(true);
    const res = await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "lessonsPage", childId: form.childId, skip: lessonList.length }),
    });
    const data = await res.json();
    setLessonsBusy(false);
    if (data.lessons) {
      setLessonList((prev) => [...prev, ...data.lessons]);
      setLessonsMore(Boolean(data.hasMore));
    }
  }

  async function runIepReview() {
    setIepBusy(true);
    setNote(null);
    const res = await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "iepReview", childId: form.childId, documentIds: selectedDocs }),
    });
    const data = await res.json();
    setIepBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setReview({ createdAt: data.createdAt, docCount: data.docCount, ...data.review });
  }

  async function archiveReviews() {
    if (!confirm(`Archive ${form.name}'s past IEP reviews? This frees the ${REVIEW_CAP}-review limit so the parent can regenerate.`)) return;
    setIepBusy(true);
    const res = await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "archiveIepReviews", childId: form.childId }),
    });
    const data = await res.json();
    setIepBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setNote(`Archived ${data.archived} review(s). The parent can generate a fresh one.`);
    router.refresh();
  }

  // Export the review as a self-contained, printable HTML file the parent can
  // open and "Save as PDF" for the meeting.
  function exportReview() {
    if (!review) return;
    const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const list = (items: string[]) => `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
    const html =
      `<!doctype html><meta charset="utf-8"><title>IEP review — ${esc(form.name)}</title>` +
      `<style>body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1a2230}` +
      `h1{font-size:1.5rem}h2{font-size:1.05rem;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px}` +
      `.tag{display:inline-block;font-size:12px;background:#eef;border-radius:6px;padding:1px 7px;margin-right:6px}` +
      `.note{font-size:12px;color:#666}li{margin:3px 0}</style>` +
      `<h1>IEP review — ${esc(form.name)}</h1>` +
      `<p class="note">A preparation aid, not legal advice. Generated ${fmtDate(review.createdAt)} from ${review.docCount} document(s).</p>` +
      `<h2>Where ${esc(form.name)} stands</h2><p>${esc(review.standing)}</p>` +
      (review.goals?.length
        ? `<h2>Goal by goal</h2>${review.goals.map((g) => `<p><strong>${esc(g.area)}</strong> — ${esc(statusLabel(g.status))}<br>${esc(g.goal)}<br><span class="note">${esc(g.evidence)}</span></p>`).join("")}`
        : "") +
      (review.goingWell?.length ? `<h2>Going well</h2>${list(review.goingWell)}` : "") +
      (review.concerns?.length ? `<h2>Watch</h2>${list(review.concerns)}` : "") +
      (review.focus?.length ? `<h2>Where to focus</h2>${list(review.focus)}` : "") +
      (review.asks?.length
        ? `<h2>Draft asks for the meeting</h2>${review.asks.map((a) => `<p><span class="tag">${esc(a.type)}</span>${esc(a.text)}<br><span class="note">${esc(a.rationale)}</span></p>`).join("")}`
        : "");
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IEP-review-${form.name.replace(/\s+/g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pending = proposal?.lessons.filter((l) => l.status === "pending") ?? [];
  const decided = proposal?.lessons.filter((l) => l.status !== "pending") ?? [];

  return (
    <main className="page" style={{ maxWidth: 820 }}>
      <p className="eyebrow">
        <Link href="/teacher/admin">Setup</Link> · Child profile
      </p>
      <h1>{form.name || "Child"}</h1>

      <div className="row" role="tablist" aria-label="Child sections" style={{ gap: 6, marginTop: 12 }}>
        {([
          ["profile", "Profile"],
          ["standing", "Where they stand"],
          ["setup", "Setup"],
          ["iep", "IEP support"],
          ["tests", "Tests"],
          ["lessons", "Lessons"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`chip ${tab === k ? "on" : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {note && (
        <p className="muted" role="status" style={{ marginTop: 10 }}>
          {note}
        </p>
      )}

      {tab === "profile" && (
        <Profile intro={intro} contact={contact} canEdit={canEditProfile} editorName={primaryGuideName} />
      )}

      {tab === "standing" &&
        (learningProfile ? (
          <LearningProfile data={learningProfile} />
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>
            This learner&apos;s profile couldn&apos;t be built.
          </p>
        ))}

      {tab === "setup" && (
        <>
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
          <label className="inline muted">
            Grade
            <select
              className="field short"
              value={form.gradeLevel}
              onChange={(e) => set("gradeLevel", e.target.value)}
            >
              <option value="">Not set</option>
              {["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((g) => (
                <option key={g} value={g}>
                  {g === "K" ? "Kindergarten" : `Grade ${g}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.82rem" }}>
          The grade {form.name || "this child"} is enrolled in. Lessons meet them where they are, but
          the weekly plan works to close any gap and get them to grade level as fast as they can
          sustain.
        </p>

        {/* Which state's standards this child is held to. Every lesson, test and
            weekly plan is generated against this framework. */}
        <label className="lbl" style={{ marginTop: 16 }}>State</label>
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="field"
            style={{ maxWidth: 260 }}
            value={form.stateCode}
            onChange={(e) => set("stateCode", e.target.value)}
          >
            <option value="">Choose a state…</option>
            {US_STATES.map((st) => (
              <option key={st.code} value={st.code}>
                {st.name}
                {IMPLEMENTED.includes(st.code) ? "" : " — approximate"}
              </option>
            ))}
          </select>
          {form.stateCode && (
            <span className={`pill ${IMPLEMENTED.includes(form.stateCode) ? "good" : "warn"}`}>
              {IMPLEMENTED.includes(form.stateCode) ? "Full standards" : "Closest match"}
            </span>
          )}
        </div>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.82rem" }}>
          {form.stateCode && IMPLEMENTED.includes(form.stateCode) ? (
            <>
              Lessons, tests and weekly plans are generated against{" "}
              <strong>{stateName(form.stateCode)}</strong>&apos;s own standards.
            </>
          ) : form.stateCode ? (
            <>
              We don&apos;t hold {stateName(form.stateCode)}&apos;s standards yet, so plans use the
              New Jersey framework — Common Core–derived, so maths and ELA line up closely, but not
              exactly. Telling us your state is how we decide which to add next.
            </>
          ) : (
            <>
              Which state&apos;s standards this child is held to. Every lesson and test is generated
              against it.
            </>
          )}
        </p>
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

      {/* Which practice platforms the family subscribes to */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Subscriptions</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Which practice platforms does your family have? Lessons stay mapped to your NJ standards —
          we pick whichever platform you have that covers the skill, so you&apos;re never asked to pay
          for something twice.
        </p>
        <div className="stack" style={{ gap: 6 }}>
          {activeProviders().map((p) => {
            const on = chosenProviders.includes(p.id);
            return (
              <label key={p.id} className="row" style={{ gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={on} onChange={() => toggleProvider(p.id)} disabled={busy} />
                <span>
                  <strong>{p.name}</strong>
                  {p.free && <span className="pill good" style={{ marginLeft: 6 }}>free</span>}
                  {!p.indexed && (
                    <span className="pill warn" style={{ marginLeft: 6 }}>
                      no skill index yet
                    </span>
                  )}
                  <span className="muted" style={{ display: "block", fontSize: "0.82rem" }}>
                    {p.blurb}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10, marginBottom: 0 }}>
          {chosenProviders.length === 0
            ? `No subscription selected — lessons will default to ${DEFAULT_PROVIDER.toUpperCase()}.`
            : "Pick more than one and each lesson goes to whichever covers that skill best."}
        </p>
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

      <People
        childId={form.childId}
        childName={form.name}
        people={people}
        history={history}
        canManageAccess={canManageAccess}
        meUserId={meUserId}
      />

      {/* Documents — uploaded here in Setup; the IEP tab picks which to use */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Documents</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload the <strong>IEP</strong>, the school&apos;s <strong>progress report</strong>, and{" "}
          <strong>MAP scores</strong> — plus any evaluation or notes. These are the documents the district
          must share. Choose which to analyze over in <strong>IEP support</strong>. PDF, image, or text,
          up to 8&nbsp;MB each.
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
              <option value="iep_progress">IEP progress report</option>
              <option value="map">MAP scores</option>
              <option value="evaluation">Evaluation</option>
              <option value="strengths">Strengths list</option>
              <option value="external_report">IXL / other report</option>
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
        </>
      )}

      {tab === "iep" && (
        <>
      {/* IEP review — the heart of the Bridge goal */}
      <div className="card lift" style={{ marginTop: 16, borderColor: "var(--accent)" }}>
        <h2 style={{ margin: "0 0 4px" }}>🌉 IEP review</h2>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Pick the documents below (newest first), then draft what&apos;s working, what isn&apos;t, where
          to focus, and new asks for your team.
        </p>

        <p
          className="muted"
          style={{ fontSize: "0.78rem", marginTop: 10, padding: "8px 10px", background: "var(--warm-soft)", borderRadius: 8 }}
        >
          A preparation aid — not legal advice or a guarantee. You know your child best; use it to have a
          stronger conversation with your IEP team.
        </p>

        {documents.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.9rem", marginTop: 12 }}>
            No documents yet — upload the IEP, progress report, and MAP in <strong>Setup → Documents</strong> first.
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p className="lbl" style={{ marginBottom: 4 }}>Documents to analyze</p>
            <div className="stack" style={{ gap: 4 }}>
              {documents.map((d) => (
                <label key={d.id} className="row" style={{ gap: 8, alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={() => toggleDoc(d.id)} />
                  <span className="pill good">{KIND_LABEL[d.kind] ?? d.kind}</span>
                  <span>{d.filename}</span>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>· {fmtDate(d.createdAt)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={runIepReview} disabled={iepBusy || selectedDocs.length === 0}>
            {iepBusy ? "Reading the documents…" : review ? "↻ Regenerate" : "✦ Generate IEP review"}
          </button>
          {review && (
            <button className="btn quiet" onClick={exportReview}>
              ⬇ Export
            </button>
          )}
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {reviewsUsed} of {REVIEW_CAP} used
          </span>
          {isAdmin && reviewsUsed > 0 && (
            <button className="chip danger" onClick={archiveReviews} disabled={iepBusy}>
              Archive (admin)
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: "0.76rem", marginTop: 6 }}>
          Regenerating is only allowed when the documents change (a new IEP or MAP) — it&apos;s
          compute-heavy. An admin can archive past reviews to reset.
        </p>

        {review && (
          <div style={{ marginTop: 14 }}>
            <p style={{ marginTop: 0 }}>
              <strong>Where {form.name} stands.</strong> {review.standing}
            </p>

            {review.goals?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: "0.95rem" }}>Goal by goal</h3>
                <div className="stack" style={{ gap: 6 }}>
                  {review.goals.map((g, i) => (
                    <div key={i} className="card" style={{ padding: "8px 10px" }}>
                      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ fontSize: "0.9rem" }}>{g.area}</strong>
                        <span className={`pill ${statusPill(g.status)}`}>{statusLabel(g.status)}</span>
                      </div>
                      <p className="muted" style={{ margin: "3px 0 0", fontSize: "0.85rem" }}>{g.goal}</p>
                      {g.evidence && <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>{g.evidence}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="row" style={{ gap: 20, flexWrap: "wrap", marginTop: 12, alignItems: "flex-start" }}>
              {review.goingWell?.length > 0 && (
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>✅ Going well</h3>
                  {bullets(review.goingWell)}
                </div>
              )}
              {review.concerns?.length > 0 && (
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>⚠️ Watch</h3>
                  {bullets(review.concerns)}
                </div>
              )}
            </div>

            {review.focus?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>🎯 Where to focus</h3>
                {bullets(review.focus)}
              </div>
            )}

            {review.asks?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: "0.95rem" }}>📝 Draft asks for the meeting</h3>
                <div className="stack" style={{ gap: 6 }}>
                  {review.asks.map((a, i) => (
                    <div key={i} className="row doc-row" style={{ justifyContent: "flex-start", gap: 8, alignItems: "flex-start" }}>
                      <span className="pill good" style={{ textTransform: "capitalize", flex: "0 0 auto" }}>
                        {a.type}
                      </span>
                      <span style={{ fontSize: "0.88rem" }}>
                        {a.text}
                        {a.rationale && <span className="muted"> — {a.rationale}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="muted" style={{ fontSize: "0.78rem", marginTop: 12 }}>
              Generated from {review.docCount} document{review.docCount === 1 ? "" : "s"}. Read every ask
              yourself before the meeting — it&apos;s a draft to react to, not a script.
            </p>
          </div>
        )}
      </div>
        </>
      )}

      {tab === "tests" && (
        <Tests
          childId={form.childId}
          childName={form.name}
          grade={form.gradeLevel}
          rows={tests}
        />
      )}

      {tab === "lessons" && (
        <>
      {/* Lesson plans — drafted from the child's documents (first Lessons subsection) */}
      <h2 style={{ marginTop: 28, marginBottom: 4 }}>Lesson plans</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Let the AI draft a starter program from {form.name}&apos;s documents, then approve the ones you want.
      </p>
      {/* Generate program */}
      <div className="row" style={{ marginTop: 16, gap: 10, alignItems: "center" }}>
        <button className="btn quiet" onClick={generateProgram} disabled={genBusy || documents.length === 0}>
          {genBusy ? "Reading the documents…" : "✦ Draft lessons from the documents"}
        </button>
        {documents.length === 0 && (
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Upload a document first.
          </span>
        )}
      </div>

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
              You&apos;ve reviewed the whole program. Approved lessons are in your library below —
              open them to publish and schedule.
            </p>
          )}
        </section>
      )}

      {/* This child's lessons — the scrolling library, newest first */}
      <section style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>📚 Lesson library</h2>
          <Link className="btn quiet" href={`/teacher/plans/new?childId=${form.childId}`}>
            ✦ New lesson
          </Link>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
          {form.name}&apos;s lessons, newest first — built by hand or generated by{" "}
          <strong>Weekly lessons</strong>. Each deep-links to an IXL skill.
        </p>
        {lessonsTotal === 0 ? (
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            No lessons yet. Generate a week in <strong>Weekly lessons</strong>, or build one with ✦ New
            lesson.
          </p>
        ) : (
          <>
          <div
            className="stack"
            style={{ gap: 8, maxHeight: 360, overflowY: "auto", paddingRight: 4, border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}
          >
            {lessonList.map((l) => (
              <div key={l.id} className="row doc-row" style={{ justifyContent: "space-between" }}>
                <span>
                  <span className="pill good" style={{ marginRight: 8 }}>
                    {subjectLabel(l.subject)}
                    {l.gradeLevel ? ` · ${gradeLabelShort(l.gradeLevel)}` : ""}
                  </span>
                  {l.title}
                  {l.standardCode && (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {" "}
                      · {l.standardCode}
                    </span>
                  )}
                  {!l.published && (
                    <span className="pill warn" style={{ marginLeft: 8 }}>
                      draft
                    </span>
                  )}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <Link className="chip" href={`/preview/${l.id}`} target="_blank">
                    Preview
                  </Link>
                  <Link className="chip" href={`/teacher/plans/${l.id}`}>
                    Edit
                  </Link>
                </span>
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                Showing {lessonList.length} of {lessonsTotal}
              </span>
              {lessonsMore && (
                <button className="btn quiet" onClick={loadMoreLessons} disabled={lessonsBusy}>
                  {lessonsBusy ? "Loading…" : "Show more"}
                </button>
              )}
            </div>
          </>
        )}
      </section>

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
        </>
      )}
    </main>
  );
}
