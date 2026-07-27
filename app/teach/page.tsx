import { redirect } from "next/navigation";
import { getCurrentTeacher, teacherRoster } from "@/lib/teacherAuth";
import { specialtyLabel } from "@/lib/specialists";
import SignIn from "./SignIn";
import ListingCard, { type ListingState } from "./ListingCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TeachHome() {
  const teacher = await getCurrentTeacher();
  if (!teacher) return <SignIn />;

  const roster = await teacherRoster(teacher.id);
  // One learner normally means going straight to them. Hold that back until
  // we've asked the directory question once — otherwise the common case never
  // gets asked at all.
  const asked = Boolean(teacher.listedAskedAt);
  if (roster.length === 1 && asked) redirect(`/teach/${roster[0].childId}`);

  const listing: ListingState = {
    name: teacher.name,
    specialty: teacher.specialty,
    listed: teacher.listed,
    asked,
    town: teacher.town,
    region: teacher.region,
    telehealth: teacher.telehealth,
    credentials: teacher.credentials,
    agesServed: teacher.agesServed,
    blurb: teacher.blurb,
    phone: teacher.phone,
    takingClients: teacher.takingClients,
    availableAt: teacher.availableAt ? teacher.availableAt.toISOString() : null,
  };

  return (
    <main className="page wrap teach-wrap">
      <p className="eyebrow">Teacher notes</p>
      <h1>Hello, {teacher.name}</h1>
      <p className="muted">
        {specialtyLabel(teacher.specialty)} · your learners are below. Notes you write are shared with
        the family, never with the child.
      </p>

      <ListingCard state={listing} />

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
