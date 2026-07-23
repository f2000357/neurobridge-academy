"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SUBJECTS, gradeLabel } from "@/lib/njsls";

export type LibPlan = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  topic: string;
  standardCode: string;
  durationMin: number;
  published: boolean;
  visibility: string;
  submittedForGlobal: boolean;
  forChild: string | null;
};

export default function LibraryView({ plans }: { plans: LibPlan[] }) {
  const [groupBy, setGroupBy] = useState<"topic" | "grade">("topic");
  const [subject, setSubject] = useState<string>("all");

  const filtered = useMemo(
    () => (subject === "all" ? plans : plans.filter((p) => p.subject === subject)),
    [plans, subject]
  );

  // Group into ordered buckets.
  const groups = useMemo(() => {
    const map = new Map<string, LibPlan[]>();
    for (const p of filtered) {
      const key =
        groupBy === "grade"
          ? p.gradeLevel
            ? gradeLabel(p.gradeLevel)
            : "No grade set"
          : p.topic || "No strand set";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [filtered, groupBy]);

  return (
    <main className="page wrap" style={{ maxWidth: 900 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Curriculum</p>
          <h1>Lesson library</h1>
        </div>
        <Link className="btn" href="/teacher/plans/new">
          ✦ New lesson
        </Link>
      </div>
      <p className="muted">
        Every lesson is aligned to the New Jersey Student Learning Standards. Browse by strand or by grade.
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              View by:
            </span>
            <button
              className={`chip ${groupBy === "topic" ? "on" : ""}`}
              onClick={() => setGroupBy("topic")}
            >
              Topic
            </button>
            <button
              className={`chip ${groupBy === "grade" ? "on" : ""}`}
              onClick={() => setGroupBy("grade")}
            >
              Grade
            </button>
          </div>
          <label className="inline muted">
            Subject
            <select className="field short" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="all">All subjects</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {groups.length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>
          No lessons yet. Create one to start your library.
        </p>
      )}

      <div className="stack" style={{ marginTop: 20, gap: 26 }}>
        {groups.map(([bucket, items]) => (
          <section key={bucket}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>{bucket}</h2>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                {items.length} lesson{items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="lib-grid">
              {items.map((p) => (
                <Link key={p.id} href={`/teacher/plans/${p.id}`} className="lib-card">
                  <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <span className="lib-subject">{p.subject}</span>
                    {p.standardCode && <span className="lib-code">{p.standardCode}</span>}
                  </div>
                  <strong className="lib-title">
                    {p.title}
                    {p.visibility === "global" && <span className="vis-badge global">global</span>}
                    {p.visibility === "center" && <span className="vis-badge center">center</span>}
                    {p.submittedForGlobal && <span className="vis-badge submitted">submitted</span>}
                  </strong>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {groupBy === "topic"
                      ? p.gradeLevel
                        ? gradeLabel(p.gradeLevel)
                        : "Any grade"
                      : p.topic || "General"}{" "}
                    · {p.durationMin} min
                    {p.forChild ? ` · for ${p.forChild}` : ""}
                    {!p.published ? " · draft" : ""}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
