import { redirect } from "next/navigation";
import { getCurrentTeacher, teacherRoster } from "@/lib/teacherAuth";
import { specialtyLabel } from "@/lib/specialists";
import SignIn from "./SignIn";
import ListingCard, { type ListingState } from "./ListingCard";
import TeachTabs from "./TeachTabs";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TeachHome({
  searchParams,
}: {
  searchParams: Promise<{ me?: string }>;
}) {
  const { me } = await searchParams;
  const teacher = await getCurrentTeacher();
  if (!teacher) return <SignIn />;

  const roster = await teacherRoster(teacher.id);
  // One learner normally means going straight to them. Hold that back until
  // we've asked the directory question once — otherwise the common case never
  // gets asked at all.
  //
  // `?me=1` always lands here. Without it a specialist with one learner could
  // never reach their own page again: no listing, no town, no way to say they
  // are full — and `takingClients` is the field most in need of changing.
  const asked = Boolean(teacher.listedAskedAt);
  if (roster.length === 1 && asked && !me) redirect(`/teach/${roster[0].childId}`);

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
        {specialtyLabel(teacher.specialty)} · notes you write are shared with the family, never with
        the child.
      </p>

      <TeachTabs
        approvalCount={0}
        studentCount={roster.length}
        // Nothing is waiting today, so open on the roster rather than on an
        // empty tab. Approvals leads once it can actually hold something.
        initial={roster.length > 0 ? "students" : "profile"}
        approvals={
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              Nothing waiting for you. When a family asks you to work with their child, the request
              lands here and you decide — nothing about that child is visible until you accept.
            </p>
          </div>
        }
        profile={<ListingCard state={listing} />}
        students={
          roster.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                No learners are assigned to you yet. A guide or centre needs to add you to a child
                before you can write notes.
              </p>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
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
          )
        }
      />
    </main>
  );
}
