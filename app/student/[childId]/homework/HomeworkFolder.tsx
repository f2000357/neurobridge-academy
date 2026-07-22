"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Q = { question: string; answer: string };
export type HwItem = {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  status: string;
  score: number | null;
  questions: Q[];
};

function dueLabel(due: string): string {
  const [y, m, d] = due.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `Due Monday, ${dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function HomeworkFolder({ childId, items }: { childId: string; items: HwItem[] }) {
  const router = useRouter();
  const [active, setActive] = useState<HwItem | null>(null);

  if (active) {
    return <Quiz childId={childId} hw={active} onDone={() => { setActive(null); router.refresh(); }} />;
  }

  const todo = items.filter((h) => h.status !== "completed");
  const done = items.filter((h) => h.status === "completed");

  return (
    <main className="page wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">📁 Homework folder</p>
      <h1>My homework</h1>
      <p className="muted">Homework is due every Monday. Take your time — there is no rush.</p>

      {items.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>Nothing here yet.</strong>{" "}
          <span className="muted">When you finish a skill, homework to practice it shows up here.</span>
        </div>
      )}

      {todo.length > 0 && (
        <div className="strip" style={{ marginTop: 16 }}>
          {todo.map((h) => (
            <div key={h.id} className="slot">
              <span className="name">{h.title}</span>
              <span className="badge next">{dueLabel(h.dueDate)}</span>
              <button className="btn" onClick={() => setActive(h)}>
                Start
              </button>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: "1rem" }}>Finished</h2>
          <div className="strip">
            {done.map((h) => (
              <div key={h.id} className="slot done">
                <span className="name">{h.title}</span>
                <span className="badge now">{h.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="muted" style={{ marginTop: 24 }}>
        <Link href={`/student/${childId}`}>← Back to my day</Link>
      </p>
    </main>
  );
}

function Quiz({ childId, hw, onDone }: { childId: string; hw: HwItem; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);

  const q = hw.questions[i];
  const total = hw.questions.length;

  function check() {
    if (!input.trim()) return;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const ok = norm(input) === norm(q.answer);
    setFeedback(ok);
    if (ok) setCorrect((c) => c + 1);
  }

  async function next() {
    setFeedback(null);
    setInput("");
    if (i + 1 < total) {
      setI(i + 1);
    } else {
      await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "complete", homeworkId: hw.id, correct, total }),
      });
      setFinished(true);
    }
  }

  if (finished) {
    return (
      <main className="page wrap" style={{ maxWidth: 560 }}>
        <section className="phase center">
          <p className="eyebrow">Homework done</p>
          <h1>Great work!</h1>
          <p className="points-summary">
            You got <strong>{correct} of {total}</strong> right and earned <strong>{correct} ⭐</strong>.
          </p>
          <button className="btn big" onClick={onDone}>
            Back to my homework
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page wrap" style={{ maxWidth: 560 }}>
      <p className="eyebrow">{hw.title}</p>
      <div className="card lift" style={{ marginTop: 12 }}>
        <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          Question {i + 1} of {total} · no timer
        </p>
        <p style={{ fontSize: "1.1rem" }}>{q.question}</p>
        {feedback === null ? (
          <div className="row">
            <input
              className="answer"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && check()}
              placeholder="Your answer"
              aria-label="Your answer"
              autoFocus
            />
            <button className="btn" onClick={check}>
              Check
            </button>
          </div>
        ) : (
          <div className={`feedback ${feedback ? "good" : "gentle"}`}>
            <p style={{ margin: 0 }}>
              {feedback ? "Correct! +5 ⭐" : `The answer is ${q.answer}. Keep going!`}
            </p>
            <button className="btn" onClick={next}>
              {i + 1 < total ? "Next" : "Finish"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
