import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { specialistsForChildren } from "@/lib/specialistQueries";
import SpecialistsPanel from "@/app/components/SpecialistsPanel";

export const dynamic = "force-dynamic";

// The guide's own visiting teachers — the piano teacher they hired, the tutor
// the centre sent. They can add and assign, but never see a code.

export default async function GuideSpecialists() {
  const user = await getCurrentUser();
  if (!user) return null;

  const children = await prisma.child.findMany({
    where: { teacherId: user.id, archived: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const teachers = await specialistsForChildren(children.map((c) => c.id));

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
