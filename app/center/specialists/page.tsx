import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { specialistsForChildren } from "@/lib/specialistQueries";
import SpecialistsPanel from "@/app/components/SpecialistsPanel";

export const dynamic = "force-dynamic";

// The centre's visiting teachers, scoped to the centre's own learners.

export default async function CenterSpecialists() {
  const me = await getCurrentUser();
  const centerId = me?.centerId ?? "";

  const children = await prisma.child.findMany({
    where: { centerId, archived: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const teachers = await specialistsForChildren(children.map((c) => c.id));

  return (
    <div>
      <p className="eyebrow">Centre</p>
      <h1>Special subject teachers</h1>
      <p className="muted">
        Every visiting teacher working with a learner at this centre. Their notes reach the family
        and the child&apos;s report; the child never sees them.
      </p>
      <SpecialistsPanel teachers={teachers} children={children} />
    </div>
  );
}
