import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { gatherReport, canReport, sinceForRange } from "@/lib/report";
import ReportNarrative from "./ReportNarrative";

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

  if (!child || !(await canReport(me, child))) {
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

  const genDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const backHref = me ? homeForRole(me.role) : "/";
  const isTerm = range === "term";

  return (
    <main className="page wrap report" style={{ maxWidth: 820 }}>
      <div className="report-actions no-print">
        <Link className="btn quiet" href={backHref}>
          ← Back
        </Link>
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
      </div>

      <header className="report-head">
        <div>
          <p className="eyebrow">Progress report</p>
          <h1 style={{ margin: "6px 0 4px" }}>{data.child.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {data.child.grade ? `Grade ${data.child.grade}` : "Grade —"}
            {data.child.age != null ? ` · Age ${data.child.age}` : ""} · Guide {data.child.guide} ·{" "}
            {data.child.center}
          </p>
        </div>
        <div className="report-date">
          <span className="mark" aria-hidden="true">
            <span></span>
          </span>
          <span>Neurable</span>
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
        This report reflects {data.child.name}&apos;s recorded work in Neurable as of {genDate}. Levels:
        emerging (&lt;50%), approaching (50–79%), proficient (80%+).
      </p>
    </main>
  );
}
