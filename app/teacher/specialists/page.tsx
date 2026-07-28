import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";
import { specialistsForChildren } from "@/lib/specialistQueries";
import SpecialistsPanel from "@/app/components/SpecialistsPanel";

export const dynamic = "force-dynamic";

// The guide's own visiting teachers — the piano teacher they hired, the tutor
// the centre sent. They can add and assign, but never see a code.

export default async function GuideSpecialists() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Every learner this guide works with. Assigning a visiting teacher is
  // day-to-day work, so it belongs to all of a child's guides equally.
  const roster = await rosterChildren(user);
  const children = roster.map((c) => ({ id: c.id, name: c.name }));
  const teachers = await specialistsForChildren(children.map((c) => c.id), {
    createdById: user.id,
  });

  return (
    <div>
      <p className="eyebrow">Visiting teachers</p>
      <h1>Special subject teachers</h1>
      <p className="muted">
        Chess coaches, piano teachers, tutors, therapists. They sign in at{" "}
        <strong>/teach</strong>{" "}
        with their own code and leave notes after each session — the notes
        come back to you and feed the child&apos;s report. Children never see them.
      </p>
      <SpecialistsPanel teachers={teachers} children={children} />
    </div>
  );
}
