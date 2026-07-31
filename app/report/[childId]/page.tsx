import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { gatherReport, canReport, childIsAuthed, sinceForRange } from "@/lib/report";
import { specialtyLabel } from "@/lib/specialists";
import ReportNarrative from "./ReportNarrative";
import ReportActions from "./ReportActions";

export const dynamic = "force-dynamic";

const LEVEL_PILL: Record<string, string> = {
  proficient: "good",
  approaching: "warn",
  emerging: "crit",
  "—": "",
};

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { childId: handle } = await params;
  const { range } = await searchParams;
  const [me, child] = await Promise.all([
    getCurrentUser(),
    prisma.child.findFirst({ where: { OR: [{ username: handle }, { id: handle }] } }),
  ]);

  const childHere = child ? await childIsAuthed(child.id, child.accessCode) : false;
  const operatorHere = child ? await canReport(me, child) : false;
  if (!child || !(operatorHere || childHere)) {
    return (
      <main className="page wrap">
        <h1>Report not available</h1>
        <p className="muted">
          <Link href={me ? homeForRole(me.role) : "/"}>← Back</Link>
        </p>
      </main>
    );
  }

  const data = await gatherReport(child.id, sinceForRange(range));
  if (!data) return null;

  const linkHandle = child.username ?? child.id;
  const genDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  // A learner (parent beside them) returns to the day; an operator to their home.
  const backHref = childHere && !operatorHere ? `/student/${linkHandle}` : me ? homeForRole(me.role) : "/";
  const isTerm = range === "term";

  return (
    <main className="page wrap report" style={{ maxWidth: 820 }}>
      <div className="report-actions no-print">
        <Link className="btn quiet" href={backHref}>
          ← Back
        </Link>
        <div className="row" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Period:
            </span>
            <Link className={`chip ${!isTerm ? "on" : ""}`} href={`/report/${handle}`}>
              All time
            </Link>
            <Link className={`chip ${isTerm ? "on" : ""}`} href={`/report/${handle}?range=term`}>
              This term
            </Link>
          </div>
          <ReportActions childName={data.child.name} />
        </div>
      </div>

      <header className="report-head">
        <div>
          <p className="eyebrow">Progress report</p>
          <h1 style={{ margin: "6px 0 4px" }}>{data.child.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {data.child.grade ? `Grade ${data.child.grade}` : "Grade —"}
            {data.child.workingGrade && data.child.workingGrade !== data.child.grade
              ? ` · working at grade ${data.child.workingGrade}`
              : ""}
            {data.child.age != null ? ` · Age ${data.child.age}` : ""} · Guide {data.child.guide} ·{" "}
            {data.child.center}
          </p>
        </div>
        <div className="report-date">
          <span className="mark" aria-hidden="true">
            <span></span>
          </span>
          <span>NeuroBridge</span>
          <em>Generated {genDate}</em>
        </div>
      </header>

      <section className="stat-row" style={{ marginTop: 18 }}>
        <div className="stat-tile">
          <span className="stat-num">{data.lessonsCompleted}</span>
          <span className="stat-lbl">Lessons completed</span>
        </div>
        <div className="stat-tile">
          <span className="stat-num">{data.points.lifetime}</span>
          <span className="stat-lbl">Points earned</span>
        </div>
        <div className="stat-tile">
          <span className="stat-num">
            {data.homework.done}/{data.homework.total}
          </span>
          <span className="stat-lbl">Homework done</span>
        </div>
        <div className="stat-tile">
          <span className="stat-num">{data.subjects.filter((s) => s.level === "proficient").length}</span>
          <span className="stat-lbl">Subjects proficient</span>
        </div>
      </section>

      <ReportNarrative key={range ?? "all"} childId={child.id} childName={data.child.name} range={range} />

      {(() => {
        const all = data.coverage.flatMap((c) => c.strands);
        const covered = all.filter((s) => s.status !== "not-started").length;
        const focus = all.filter((s) => s.status === "needs-work" || s.status === "not-started");
        // Coverage is computed where he is WORKING, so it must say so — under a
        // grade-5 heading these grade-3 strands would read as year-5 gaps.
        const cg = data.child.workingGrade || data.child.grade;
        const gradeLabel = cg ? `Grade ${cg}` : "this grade";
        return (
          <>
            <h2 className="report-h2">
              What {data.child.name.split(" ")[0]} has covered · {gradeLabel} {data.standardsState}
            </h2>
            <p className="muted" style={{ marginTop: -6 }}>
              {covered > 0 ? (
                <>
                  Work assessed in <strong>{covered}</strong> of {all.length} areas.{" "}
                  {all.length - covered} not started yet — normal early on, and the plan works
                  through them.
                </>
              ) : (
                <>
                  Nothing assessed yet in these areas. Practice he has done on a provider counts
                  here once you check it on Today.
                </>
              )}
            </p>

            <div className="cov-grid">
              {data.coverage.map((c) => {
                // Lead with what he has actually done. Listing eighteen
                // untouched strands above two real ones made a child with 22
                // finished lessons and 8 mastered skills read as having done
                // nothing at all.
                const started = c.strands.filter((s) => s.status !== "not-started");
                const untouched = c.strands.filter((s) => s.status === "not-started");
                return (
                <div key={c.subject} className="cov-card">
                  <h3 className="report-h3">{c.subject}</h3>
                  {started.length === 0 && (
                    <p className="muted" style={{ margin: "0 0 6px", fontSize: "0.82rem" }}>
                      Not started yet.
                    </p>
                  )}
                  <ul className="cov-list">
                    {started.map((s) => (
                      <li key={s.strand} className={`cov-row st-${s.status}`}>
                        <span className="cov-dot" aria-hidden="true" />
                        <span className="cov-name">{s.strand}</span>
                        <span className="cov-meta">
                          {s.status === "not-started"
                            ? "not started"
                            : `${s.avgScore ?? "—"}%${s.lessons ? ` · ${s.lessons}` : ""}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {untouched.length > 0 && (
                    <details style={{ marginTop: 4 }}>
                      <summary className="muted" style={{ fontSize: "0.8rem", cursor: "pointer" }}>
                        {untouched.length} not started yet
                      </summary>
                      <ul className="cov-list" style={{ marginTop: 4 }}>
                        {untouched.map((s) => (
                          <li key={s.strand} className="cov-row st-not-started">
                            <span className="cov-dot" aria-hidden="true" />
                            <span className="cov-name">{s.strand}</span>
                            <span className="cov-meta">not started</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                );
              })}
            </div>

            {focus.length > 0 && (
              <div className="callout-focus">
                <strong>Where to focus next</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {focus
                    .slice(0, 6)
                    .map((s) => `${s.strand}${s.status === "needs-work" ? " (needs work)" : ""}`)
                    .join(" · ")}
                  {focus.length > 6 ? ` · +${focus.length - 6} more` : ""}
                </p>
              </div>
            )}
          </>
        );
      })()}

      <h2 className="report-h2">
        Mastery by subject{isTerm ? " · this term" : ""}
      </h2>
      {data.subjects.length === 0 ? (
        <p className="muted">No graded work yet — mastery will appear here as {data.child.name} completes lessons.</p>
      ) : (
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Graded</th>
                <th>Average</th>
                <th>Level</th>
                <th>Standards mastered</th>
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => (
                <tr key={s.subject}>
                  <td>{s.subject}</td>
                  <td className="tabnum">{s.graded}</td>
                  <td className="tabnum">{s.avgScore == null ? "—" : `${s.avgScore}%`}</td>
                  <td>
                    {s.level === "—" ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={`pill ${LEVEL_PILL[s.level]}`}>{s.level}</span>
                    )}
                  </td>
                  <td>
                    {s.standardsMastered.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="std-list">{s.standardsMastered.join(", ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(data.strengths.length > 0 || data.struggles.length > 0) && (
        <div className="report-two">
          <div>
            <h2 className="report-h2">Strengths seen</h2>
            <ul className="report-ul">
              {data.strengths.length ? data.strengths.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">—</li>}
            </ul>
          </div>
          <div>
            <h2 className="report-h2">Where they got stuck</h2>
            <ul className="report-ul">
              {data.struggles.length ? data.struggles.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">—</li>}
            </ul>
          </div>
        </div>
      )}

      {data.teacherNotes.length > 0 && (
        <>
          <h2 className="report-h2">From their teachers</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Written by the specialists who work with {data.child.name} in person.
          </p>
          <div className="stack" style={{ gap: 10 }}>
            {data.teacherNotes.map((n, i) => (
              <div key={i} className="report-note">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>
                    {n.teacher} · {specialtyLabel(n.subject)}
                  </strong>
                  <span className="muted tabnum">{n.date}</span>
                </div>
                <p style={{ margin: "4px 0" }}>{n.whatWeDid}</p>
                {n.wentWell && (
                  <p className="muted" style={{ margin: "2px 0" }}>
                    <strong>Went well:</strong> {n.wentWell}
                  </p>
                )}
                {n.struggledWith && (
                  <p className="muted" style={{ margin: "2px 0" }}>
                    <strong>Hard:</strong> {n.struggledWith}
                  </p>
                )}
                {n.nextTime && (
                  <p className="muted" style={{ margin: "2px 0" }}>
                    <strong>Next time:</strong> {n.nextTime}
                  </p>
                )}
                {n.focus != null && (
                  <p className="muted" style={{ margin: "2px 0", fontSize: "0.85rem" }}>
                    Settled {n.focus}/5
                  </p>
                )}

                {/* The pictures, not a count of them. For most parents this is
                    the part of the day summary they actually came for. */}
                {n.media.length > 0 && (
                  <div className="note-media">
                    {n.media.map((m) =>
                      m.kind === "video" ? (
                        <a key={m.id} className="note-clip" href={`/api/media/${m.id}`} target="_blank" rel="noreferrer">
                          <span aria-hidden="true">▶</span>
                          <span>{m.caption || "Watch the clip"}</span>
                        </a>
                      ) : (
                        <a key={m.id} href={`/api/media/${m.id}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/media/${m.id}`} alt={m.caption || "From the session"} />
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {data.weeklyTests.length > 0 && (
        <>
          <h2 className="report-h2">Weekly check-ins</h2>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  {Object.keys(data.weeklyTests[data.weeklyTests.length - 1].scores).map((subj) => (
                    <th key={subj}>{subj}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.weeklyTests.map((w) => (
                  <tr key={w.weekStart}>
                    <td className="tabnum">{w.weekStart}</td>
                    {Object.values(w.scores).map((v, i) => (
                      <td key={i} className="tabnum">
                        {v}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="muted report-foot">
        This report reflects {data.child.name}&apos;s recorded work in NeuroBridge as of {genDate}. Levels:
        emerging (&lt;50%), approaching (50–79%), proficient (80%+).
      </p>
    </main>
  );
}
