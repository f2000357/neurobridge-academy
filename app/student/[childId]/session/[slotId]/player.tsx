"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type WsItem = { question: string; answer: string };
export type Chunk = {
  type: string; // read_text | visual | video | worksheet | wrap_up
  title?: string;
  content?: string;
  visual?: string;
  videoNote?: string;
  items?: number | WsItem[];
  seed_question?: string;
  seed_answer?: string;
  read_aloud?: boolean;
};

type Lesson = { title: string; goal: string; why: string; durationMin: number; workUrl?: string };
type Phase = "arrive" | "ground" | "deliver" | "close";
type Round = "core" | "challenge";

// Each chapter's assessment: 10 core questions + 3 challenge questions for extra points.
const CORE_N = 10;
const CHAL_N = 3;
const PTS_CORE = 1; // 1 point per correct question
const PTS_CHAL = 2; // 2 points per correct challenge (hard) question
const DIFF_START = 3; // 1 (easy) … 5 (hard)

function stepLabel(c: Chunk): string {
  if (c.title && c.title.trim()) return c.title.trim();
  if (c.type === "video") return "Watch a short video";
  if (c.type === "visual") return "Look at this";
  if (c.type === "worksheet") return "Questions";
  return "Read this";
}

// A pre-written question for this slot, if the lesson provides a fixed list.
function wsFixed(c: Chunk, num: number): WsItem | null {
  if (Array.isArray(c.items) && c.items[num - 1]) return c.items[num - 1];
  return null;
}

type Resume = {
  phase?: Phase;
  stepIdx?: number;
  round?: Round;
  qNum?: number;
  difficulty?: number;
  points?: number;
  question?: { question: string; answer: string } | null;
  doneSteps?: boolean[];
  stepContent?: string[];
  pinned?: number[];
};

export default function Player({
  childId,
  dayHref,
  childName,
  sessionId,
  lesson,
  chunks,
  after,
  resumeState,
  resumeData,
  initialTodayPoints = 0,
  preview = false,
  previewBackHref,
}: {
  childId: string;
  dayHref?: string;
  childName: string;
  sessionId: string;
  lesson: Lesson;
  chunks: Chunk[];
  after: string;
  resumeState: string;
  resumeData?: string;
  initialTodayPoints?: number;
  preview?: boolean;
  previewBackHref?: string;
}) {
  const steps = chunks.filter((c) => c.type !== "wrap_up");

  // A saved snapshot lets a closed-and-reopened browser resume in the same spot.
  const ir: Resume | null = (() => {
    if (preview || !resumeData) return null;
    try {
      return JSON.parse(resumeData) as Resume;
    } catch {
      return null;
    }
  })();

  const [phase, setPhase] = useState<Phase>(
    ir?.phase ??
      (resumeState === "delivering" || resumeState === "checking" ? "deliver" : "arrive")
  );
  const [stepIdx, setStepIdx] = useState(ir?.stepIdx ?? 0);
  const [doneSteps, setDoneSteps] = useState<boolean[]>(
    ir?.doneSteps ?? steps.map(() => false)
  );
  const [groundText, setGroundText] = useState<string>("");
  const [teachText, setTeachText] = useState<string>("");
  // Delivered text per reading step, so finished passages stay readable as cards.
  const [stepContent, setStepContent] = useState<string[]>(
    ir?.stepContent ?? steps.map(() => "")
  );
  // Steps the child chose to keep visible while they answer questions.
  const [pinned, setPinned] = useState<number[]>(ir?.pinned ?? []);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // Assessment state
  const [round, setRound] = useState<Round>(ir?.round ?? "core");
  const [qNum, setQNum] = useState(ir?.qNum ?? 1);
  const [difficulty, setDifficulty] = useState(ir?.difficulty ?? DIFF_START);
  const [challengeIntro, setChallengeIntro] = useState(false);
  const [question, setQuestion] = useState<{ question: string; answer: string } | null>(
    ir?.question ?? null
  );
  const [answerInput, setAnswerInput] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const results = useRef<{ correct: boolean }[]>([]);
  // Which step the in-progress assessment belongs to, so stepping back and
  // forward again resumes it instead of starting over.
  const assessmentFor = useRef<number | null>(null);

  // Points (calm running total for today)
  const [points, setPoints] = useState(ir?.points ?? 0);
  const [todayPoints, setTodayPoints] = useState(initialTodayPoints);
  const [pointFlash, setPointFlash] = useState(0);

  const api = useCallback(
    async (endpoint: string, payload: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { error: `http_${res.status}` };
        return await res.json();
      } catch {
        return { error: "network" };
      }
    },
    []
  );

  const signal = useCallback(
    (kind: string, payload: Record<string, unknown> = {}) => {
      if (preview) return;
      void api("session", { op: "signal", sessionId, chunkIndex: stepIdx, kind, payload });
    },
    [api, sessionId, stepIdx, preview]
  );

  const setState = useCallback(
    (state: string) => {
      if (preview) return;
      void api("session", { op: "state", sessionId, state });
    },
    [api, sessionId, preview]
  );

  // Persist a full snapshot so progress survives a browser close (no abandon).
  const saveResume = useCallback(
    (patch: Partial<Resume>) => {
      if (preview) return;
      const snap: Resume = {
        phase,
        stepIdx,
        round,
        qNum,
        difficulty,
        points,
        question,
        doneSteps,
        stepContent,
        pinned,
        ...patch,
      };
      void api("session", { op: "resume", sessionId, resumeData: JSON.stringify(snap), pointsEarned: snap.points });
    },
    [api, sessionId, preview, phase, stepIdx, round, qNum, difficulty, points, question, doneSteps, stepContent, pinned]
  );

  // --- Speech ---
  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(u);
  }

  // --- Content fetchers (shared by start + resume) ---
  const fetchGround = useCallback(async () => {
    setBusy(true);
    const r = await api("tutor", {
      op: "ground",
      childId,
      title: lesson.title,
      goal: lesson.goal,
      why: lesson.why,
      steps: steps.map(stepLabel),
      durationMin: lesson.durationMin,
      after,
    });
    setGroundText(
      r.text ??
        `Hi! Today we're doing: ${lesson.goal || lesson.title}. Take your time — press "I'm ready" when you feel ready.`
    );
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, childId, lesson, after]);

  const fetchTeach = useCallback(
    async (chunk: Chunk, idx: number) => {
      setBusy(true);
      setHint(null);
      const r = await api("tutor", { op: "teach", childId, chunk, lessonTitle: lesson.title, goal: lesson.goal });
      const text = r.text ?? chunk.content ?? `Let's look at: ${stepLabel(chunk)}.`;
      setTeachText(text);
      // Remember this passage so it can stay on the page as a reference card.
      setStepContent((prev) => {
        const n = prev.slice();
        n[idx] = text;
        return n;
      });
      setBusy(false);
    },
    [api, childId, lesson.title, lesson.goal]
  );

  const loadQuestion = useCallback(
    async (chunk: Chunk, r: Round, num: number) => {
      setFeedback(null);
      setAnswerInput("");
      // Core questions can reuse the lesson's own authored questions when present.
      const fixed = r === "core" ? wsFixed(chunk, num) : null;
      if (fixed) {
        setQuestion({ question: fixed.question, answer: fixed.answer });
        return;
      }
      setBusy(true);
      const res = await api("tutor", {
        op: "worksheet_question",
        childId,
        lessonTitle: lesson.title,
        goal: lesson.goal,
        questionNum: num,
        totalQuestions: r === "core" ? CORE_N : CHAL_N,
        difficulty: r === "challenge" ? 5 : difficulty,
        challenge: r === "challenge",
        priorResults: results.current,
      });
      setQuestion(
        res?.question
          ? { question: res.question, answer: res.answer ?? "" }
          : { question: "Let's try one.", answer: "" }
      );
      setBusy(false);
    },
    [api, childId, lesson.title, lesson.goal, difficulty]
  );

  // --- Phase: ground ---
  async function enterGround() {
    setPhase("ground");
    setState("grounded");
    saveResume({ phase: "ground" });
    await fetchGround();
  }

  // --- Phase: deliver ---
  async function startStep(idx: number) {
    setStepIdx(idx);
    setTeachText("");
    setHint(null);
    const chunk = steps[idx];

    if (chunk.type === "worksheet") {
      // Returning to an assessment already in progress (e.g. after stepping back
      // to re-read): keep their place, points and answers instead of restarting.
      if (assessmentFor.current === idx) {
        if (!question) await loadQuestion(chunk, round, qNum);
        saveResume({ phase: "deliver", stepIdx: idx });
        return;
      }
      assessmentFor.current = idx;
      setFeedback(null);
      setQuestion(null);
      setAnswerInput("");
      setRound("core");
      setQNum(1);
      setDifficulty(DIFF_START);
      results.current = [];
      await loadQuestion(chunk, "core", 1);
      saveResume({ phase: "deliver", stepIdx: idx, round: "core", qNum: 1 });
      return;
    }

    // Keep any in-progress question in state (it only renders during the
    // assessment) so stepping back to re-read and returning lands on the same
    // question rather than generating a new one.
    setFeedback(null);
    setAnswerInput("");
    // Stepping back to a step already delivered? Show the same words again,
    // instantly, rather than asking the tutor for new ones.
    if (stepContent[idx]) setTeachText(stepContent[idx]);
    else await fetchTeach(chunk, idx);
    saveResume({ phase: "deliver", stepIdx: idx });
  }

  async function goBack() {
    if (stepIdx > 0) await startStep(stepIdx - 1);
  }

  async function beginDeliver() {
    setPhase("deliver");
    setState("delivering");
    await startStep(0);
  }

  async function finishStep() {
    const next = doneSteps.slice();
    next[stepIdx] = true;
    setDoneSteps(next);
    if (!preview) void api("session", { op: "state", sessionId, chunkProgress: next });
    if (stepIdx + 1 < steps.length) {
      await startStep(stepIdx + 1);
    } else {
      setPhase("close");
      setState("checking");
      saveResume({ phase: "close", doneSteps: next });
    }
  }

  async function simplify() {
    const source = teachText || steps[stepIdx].content || "";
    if (!source.trim()) return;
    signal("simplify_request", { step: stepLabel(steps[stepIdx]) });
    setBusy(true);
    setHint(null);
    const r = await api("tutor", { op: "simplify", childId, content: source });
    setBusy(false);
    if (r?.text) {
      setTeachText(r.text);
      setStepContent((prev) => {
        const n = prev.slice();
        n[stepIdx] = r.text;
        return n;
      });
    } else setHint("Couldn't make it simpler just now — try again in a moment.");
  }

  // --- Assessment ---
  async function submitAnswer() {
    if (!question || !answerInput.trim()) return;
    setBusy(true);
    const r = await api("tutor", {
      op: "check_answer",
      childId,
      question: question.question,
      expected: question.answer,
      studentAnswer: answerInput,
    });
    setBusy(false);

    let correct = r?.correct;
    let text = r?.feedback;
    if (typeof correct !== "boolean") {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
      correct = Boolean(question.answer) && norm(answerInput) === norm(question.answer);
      text = correct ? "Yes, that's right!" : "Good try. Let's keep going.";
    }

    results.current.push({ correct });
    signal("answer", { question: question.question, answer: answerInput, correct, round });

    // Award points + adapt difficulty (core only).
    let newPoints = points;
    if (correct) {
      const gain = round === "challenge" ? PTS_CHAL : PTS_CORE;
      newPoints = points + gain;
      setPoints(newPoints);
      setPointFlash(gain);
      setTimeout(() => setPointFlash(0), 1500);
      if (!preview) {
        const res = await api("session", {
          op: "award",
          sessionId,
          childId,
          points: gain,
          kind: round === "challenge" ? "challenge" : "core",
        });
        if (typeof res?.todayPoints === "number") setTodayPoints(res.todayPoints);
      } else {
        setTodayPoints((t) => t + gain);
      }
    }
    if (round === "core") {
      setDifficulty((d) => Math.max(1, Math.min(5, correct ? d + 1 : d - 1)));
    }

    setFeedback({ correct, text: text ?? "" });
    saveResume({ points: newPoints });
  }

  async function nextQuestion() {
    const chunk = steps[stepIdx];
    if (round === "core") {
      if (qNum < CORE_N) {
        const n = qNum + 1;
        setQNum(n);
        await loadQuestion(chunk, "core", n);
        saveResume({ qNum: n });
      } else {
        // Core done — offer the bonus challenges.
        setChallengeIntro(true);
        setFeedback(null);
      }
    } else {
      if (qNum < CHAL_N) {
        const n = qNum + 1;
        setQNum(n);
        await loadQuestion(chunk, "challenge", n);
        saveResume({ qNum: n });
      } else {
        await finishStep();
      }
    }
  }

  async function startChallenges() {
    setChallengeIntro(false);
    setRound("challenge");
    setQNum(1);
    await loadQuestion(steps[stepIdx], "challenge", 1);
    saveResume({ round: "challenge", qNum: 1 });
  }

  async function skipChallenges() {
    setChallengeIntro(false);
    await finishStep();
  }

  async function completeSession() {
    if (preview) return;
    await api("session", { op: "complete", sessionId });
  }

  useEffect(() => {
    if (phase === "close") void completeSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // On (re)mount, hydrate the current phase's dynamic content if resuming.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (!ir) return;
    void (async () => {
      if (ir.phase === "ground") {
        await fetchGround();
      } else if (ir.phase === "deliver") {
        const c = steps[ir.stepIdx ?? 0];
        if (!c) return;
        if (c.type === "worksheet") {
          if (!ir.question) await loadQuestion(c, ir.round ?? "core", ir.qNum ?? 1);
        } else {
          await fetchTeach(c, ir.stepIdx ?? 0);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePin(i: number) {
    setPinned((prev) => {
      const next = prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i];
      saveResume({ pinned: next });
      return next;
    });
  }

  const chunk = steps[stepIdx];
  const isAssessment = chunk?.type === "worksheet";
  const isPinned = pinned.includes(stepIdx);

  // Finished reading steps become reference cards the child can look back at.
  const refIndices = steps
    .map((_, i) => i)
    .filter(
      (i) =>
        i !== stepIdx &&
        doneSteps[i] &&
        steps[i].type !== "worksheet" &&
        (stepContent[i] || steps[i].content)
    );
  const pinnedRefs = refIndices.filter((i) => pinned.includes(i));

  return (
    <div className="player">
      {preview && (
        <div className="preview-bar">
          <span>
            <strong>Preview</strong> — this is how {childName === "there" ? "a student" : childName} sees
            the lesson. Nothing is recorded.
          </span>
          {previewBackHref && (
            <a className="btn quiet" href={previewBackHref}>
              ← Back to editing
            </a>
          )}
        </div>
      )}
      <header className="topbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            {lesson.title}
          </span>
          {!preview ? (
            <span className={`points ${pointFlash ? "flash" : ""}`} aria-label={`${todayPoints} points today`}>
              ⭐ {todayPoints}
              {pointFlash > 0 && <span className="points-gain">+{pointFlash}</span>}
            </span>
          ) : (
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Preview mode
            </span>
          )}
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 720 }}>
        {phase === "arrive" && (
          <section className="phase center">
            <p className="eyebrow">Time for</p>
            <h1>{lesson.title}</h1>
            <p className="muted">Take a slow breath. There is no rush.</p>
            <button className="btn big" onClick={enterGround}>
              I&apos;m here
            </button>
          </section>
        )}

        {phase === "ground" && (
          <section className="phase">
            <p className="eyebrow">Let&apos;s get ready</p>
            <div className="ground-grid">
              <div className="card lift tutor-bubble">
                {busy ? (
                  <p className="muted">One moment…</p>
                ) : (
                  <>
                    <p style={{ margin: 0 }}>{groundText}</p>
                    <button className="chip" onClick={() => speak(groundText)}>
                      {speaking ? "⏸ Stop" : "🔊 Read to me"}
                    </button>
                  </>
                )}
              </div>
              <div className="card">
                <h2>Our steps</h2>
                <ol className="steps">
                  {steps.map((s, i) => (
                    <li key={i}>{stepLabel(s)}</li>
                  ))}
                </ol>
                <p className="muted" style={{ fontSize: "0.9rem" }}>
                  About {lesson.durationMin} minutes · Then: {after}
                </p>
                {lesson.workUrl && (
                  <a
                    className="chip work-link"
                    href={lesson.workUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📗 Open the practice (for a grown-up) ↗
                  </a>
                )}
              </div>
            </div>
            <button className="btn big" onClick={beginDeliver} disabled={busy}>
              I&apos;m ready
            </button>
          </section>
        )}

        {phase === "deliver" && chunk && (
          <section className="phase deliver-grid">
            <aside className="card steps-rail">
              <ol className="steps">
                {steps.map((s, i) => (
                  <li key={i} className={doneSteps[i] ? "done" : i === stepIdx ? "current" : ""}>
                    {stepLabel(s)}
                  </li>
                ))}
              </ol>
            </aside>

            <div className="stack">
              {/* Passages kept in view stick to the top while questions are answered. */}
              {pinnedRefs.length > 0 && (
                <div className="pinned-region">
                  {pinnedRefs.map((i) => (
                    <ReferenceCard
                      key={`pin-${i}`}
                      label={stepLabel(steps[i])}
                      text={stepContent[i] || steps[i].content || ""}
                      pinned
                      onTogglePin={() => togglePin(i)}
                      onSpeak={speak}
                    />
                  ))}
                </div>
              )}

              <div className="card lift tutor-bubble">
                <div className="step-head">
                  <p className="eyebrow" style={{ margin: 0 }}>
                    Step {stepIdx + 1} of {steps.length}: {stepLabel(chunk)}
                  </p>
                  {stepIdx > 0 && (
                    <button className="chip" onClick={goBack} disabled={busy}>
                      ← Back
                    </button>
                  )}
                </div>

                {!isAssessment && (
                  <>
                    {chunk.visual === "fraction-bars" && <FractionBars />}
                    <p className="passage">{busy ? "One moment…" : teachText}</p>
                    {hint && (
                      <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 4px" }}>
                        {hint}
                      </p>
                    )}
                    {!busy && (
                      <div className="row">
                        <button className="chip" onClick={() => speak(teachText)}>
                          {speaking ? "⏸ Stop" : "🔊 Read to me"}
                        </button>
                        <button className="chip" onClick={simplify}>
                          Make it simpler
                        </button>
                        <button
                          className={`chip pin-chip ${isPinned ? "on" : ""}`}
                          onClick={() => togglePin(stepIdx)}
                          aria-pressed={isPinned}
                          title="Keep this on screen while you answer questions"
                        >
                          {isPinned ? "📌 Kept in view" : "📌 Keep in view"}
                        </button>
                        <button className="btn" onClick={finishStep}>
                          Got it — next
                        </button>
                      </div>
                    )}
                  </>
                )}

                {isAssessment && challengeIntro && (
                  <div className="challenge-intro">
                    <p className="eyebrow" style={{ color: "var(--warm)" }}>
                      Bonus round
                    </p>
                    <p style={{ fontSize: "1.05rem" }}>
                      Great work! Now {CHAL_N} <strong>challenge questions</strong> — a bit harder, worth
                      extra points ⭐. Want to try?
                    </p>
                    <div className="row">
                      <button className="btn" onClick={startChallenges}>
                        Yes, let&apos;s try
                      </button>
                      <button className="btn quiet" onClick={skipChallenges}>
                        I&apos;m done for now
                      </button>
                    </div>
                  </div>
                )}

                {isAssessment && !challengeIntro && (
                  <>
                    <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
                      {round === "challenge" ? "🌟 Challenge" : "Question"} {qNum} of{" "}
                      {round === "challenge" ? CHAL_N : CORE_N} · no timer
                    </p>
                    <p style={{ fontSize: "1.1rem" }}>
                      {busy && !question ? "One moment…" : question?.question}
                    </p>
                    {!feedback ? (
                      <div className="row">
                        <input
                          className="answer"
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                          placeholder="Your answer"
                          aria-label="Your answer"
                          disabled={busy}
                        />
                        <button className="btn" onClick={submitAnswer} disabled={busy}>
                          Check
                        </button>
                      </div>
                    ) : (
                      <div className={`feedback ${feedback.correct ? "good" : "gentle"}`}>
                        <p style={{ margin: 0 }}>
                          {feedback.text}
                          {feedback.correct && (
                            <strong> +{round === "challenge" ? PTS_CHAL : PTS_CORE} ⭐</strong>
                          )}
                        </p>
                        <button className="btn" onClick={nextQuestion}>
                          {round === "core" && qNum >= CORE_N
                            ? "On to the bonus round →"
                            : round === "challenge" && qNum >= CHAL_N
                              ? "Finish"
                              : "Next question"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {phase === "close" && (
          <section className="phase center">
            <p className="eyebrow">All steps done</p>
            <h1>Look what you did, {childName}!</h1>
            {points > 0 && (
              <p className="points-summary">
                You collected <strong>{points} ⭐</strong> this lesson.
              </p>
            )}
            <ol className="steps closing">
              {steps.map((s, i) => (
                <li key={i} className="done">
                  {stepLabel(s)}
                </li>
              ))}
            </ol>
            <p className="muted">How did that feel?</p>
            <div className="row" style={{ justifyContent: "center" }}>
              {["Easy", "Okay", "Hard"].map((f) => (
                <button
                  key={f}
                  className="chip"
                  onClick={(e) => {
                    signal("reflection", { feeling: f.toLowerCase() });
                    (e.target as HTMLButtonElement).classList.add("on");
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 20 }}>
              {preview ? "That's the whole lesson." : `Next: ${after}`}
            </p>
            <Link className="btn big" href={preview ? previewBackHref ?? "/teacher/library" : dayHref ?? `/student/${childId}`}>
              {preview ? "← Back to editing" : "Back to my day"}
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

// A finished passage the child can look back at — collapsible, pinnable, readable.
function ReferenceCard({
  label,
  text,
  pinned,
  onTogglePin,
  onSpeak,
}: {
  label: string;
  text: string;
  pinned: boolean;
  onTogglePin: () => void;
  onSpeak: (t: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`card ref-card ${pinned ? "pinned" : ""}`}>
      <div className="ref-head">
        <button
          className="ref-title"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> {label}
        </button>
        <div className="ref-tools">
          <button className="chip" onClick={() => onSpeak(text)} title="Read this to me">
            🔊
          </button>
          <button
            className={`chip pin-chip ${pinned ? "on" : ""}`}
            onClick={onTogglePin}
            aria-pressed={pinned}
            title={pinned ? "Unpin" : "Keep this on screen"}
          >
            {pinned ? "📌 Pinned" : "📌 Keep in view"}
          </button>
        </div>
      </div>
      {open && <p className="passage ref-text">{text}</p>}
    </div>
  );
}

// Simple built-in visual for the fractions lesson.
function FractionBars() {
  const bar = (shaded: number) => (
    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 56,
            height: 28,
            borderRadius: 6,
            border: "2px solid var(--accent)",
            background: i < shaded ? "var(--accent)" : "transparent",
          }}
        />
      ))}
    </div>
  );
  return (
    <div style={{ margin: "10px 0 16px" }} aria-label="Fraction bars showing 1/4 and 2/4">
      {bar(1)}
      {bar(2)}
    </div>
  );
}
