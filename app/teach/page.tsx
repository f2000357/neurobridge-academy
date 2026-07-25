import { redirect } from "next/navigation";
import { getCurrentTeacher, teacherRoster } from "@/lib/teacherAuth";
import { specialtyLabel } from "@/lib/specialists";
import SignIn from "./SignIn";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TeachHome() {
  const teacher = await getCurrentTeacher();
  if (!teacher) return <SignIn />;

  const roster = await teacherRoster(teacher.id);
  if (roster.length === 1) redirect(`/teach/${roster[0].childId}`);

  return (
    <main className="page wrap teach-wrap">
      <p className="eyebrow">Teacher notes</p>
      <h1>Hello, {teacher.name}</h1>
      <p className="muted">
        {specialtyLabel(teacher.specialty)} · your learners are below. Notes you write are shared with
        the family, never with the child.
      </p>

      {roster.length === 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="muted" style={{ margin: 0 }}>
            No learners are assigned to you yet. A guide or centre needs to add you to a child before
            you can write notes.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10, marginTop: 18 }}>
          {roster.map((r) => (
            <Link key={r.childId} href={`/teach/${r.childId}`} className="card roster-card">
              <span className="roster-name">{r.name}</span>
              <span className="muted">
                {specialtyLabel(r.subject)}
                {r.age != null ? ` · age ${r.age}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
