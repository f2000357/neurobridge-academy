"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type TQ = { subject: string; question: string; answer: string };

export default function TestFlow({
  childId,
  childName,
  slotId,
  dayHref,
}: {
  childId: string;
  childName: string;
  slotId: string;
  dayHref: string;
}) {
  const [questions, setQuestions] = useState<TQ[] | null>(null);
  const [i, setI] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"intro" | "quiz" | "done">("intro");
  const results = useRef<{ subject: string; correct: boolean }[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void fetch("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "generate", childId }),
    })
      .then((r) => r.json())
      .then((d) => setQuestions(Array.isArray(d.questions) ? d.questions : []));
  }, [childId]);

  function submitAnswer() {
    if (!questions) return;
    const q = questions[i];
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const correct = Boolean(q.answer) && norm(input) === norm(q.answer);
    results.current.push({ subject: q.subject, correct });
    setInput("");
    if (i + 1 < questions.length) {
      setI(i + 1);
    } else {
      finish();
    }
  }

  async function skip() {
    if (!questions) return;
    results.current.push({ subject: questions[i].subject, correct: false });
    setInput("");
    if (i + 1 < questions.length) setI(i + 1);
    else finish();
  }

  async function finish() {
    setPhase("done");
    await fetch("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "submit", childId, slotId, results: results.current }),
    });
  }

  return (
    <div className="player">
      <header className="topbar kidbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            Weekly check-in
          </span>
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 620 }}>
        {phase === "intro" && (
          <section className="phase center">
            <p className="eyebrow">Weekly check-in</p>
            <h1>Hi {childName} 👋</h1>
            <p className="muted" style={{ maxWidth: "42ch" }}>
              This is a little check-in with a few questions on different subjects. There&apos;s no
              timer and no pressure — it just helps us plan a great week for you. Do your best!
            </p>
            <button
              className="btn big"
              onClick={() => setPhase("quiz")}
              disabled={!questions || questions.length === 0}
            >
              {questions ? "I'm ready" : "One moment…"}
            </button>
          </section>
        )}

        {phase === "quiz" && questions && questions[i] && (
          <section className="phase">
            <div className="card lift tutor-bubble">
              <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
                Question {i + 1} of {questions.length} · {questions[i].subject} · no timer
              </p>
              <p style={{ fontSize: "1.15rem" }}>{questions[i].question}</p>
              <div className="row">
                <input
                  className="answer"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                  placeholder="Your answer"
                  aria-label="Your answer"
                  autoFocus
                />
                <button className="btn" onClick={submitAnswer} disabled={!input.trim()}>
                  Next
                </button>
              </div>
              <button className="chip" onClick={skip}>
                I&apos;m not sure — skip
              </button>
            </div>
          </section>
        )}

        {phase === "done" && (
          <section className="phase center">
            <p className="eyebrow">All done</p>
            <h1>Thank you, {childName}! 🌟</h1>
            <p className="muted" style={{ maxWidth: "40ch" }}>
              You finished your weekly check-in. This helps us build a week that fits you just right.
            </p>
            <Link className="btn big" href={dayHref}>
              Back to my day
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
