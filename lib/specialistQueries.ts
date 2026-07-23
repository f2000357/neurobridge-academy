import { prisma } from "./prisma";
import type { TeacherRow } from "@/app/components/SpecialistsPanel";

// Which specialists a given role should see: the ones teaching learners that
// role is responsible for. The code is only ever included for Neurable admin.

export async function specialistsForChildren(
  childIds: string[],
  { includeCode = false }: { includeCode?: boolean } = {}
): Promise<TeacherRow[]> {
  const teachers = await prisma.specialistTeacher.findMany({
    where: { assignments: { some: { childId: { in: childIds } } } },
    include: {
      assignments: {
        where: { childId: { in: childIds } },
        include: { child: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return teachers.map((t) => toRow(t, includeCode));
}

/** Every specialist on the platform — Neurable admin only. */
export async function allSpecialists(): Promise<TeacherRow[]> {
  const teachers = await prisma.specialistTeacher.findMany({
    include: { assignments: { include: { child: { select: { id: true, name: true } } } } },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });
  return teachers.map((t) => toRow(t, true));
}

type WithAssignments = {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  archived: boolean;
  code: string;
  codeSentAt: Date | null;
  createdByName: string;
  assignments: { childId: string; subject: string; child: { id: string; name: string } }[];
};

function toRow(t: WithAssignments, includeCode: boolean): TeacherRow {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone,
    specialty: t.specialty,
    archived: t.archived,
    ...(includeCode ? { code: t.code } : {}),
    codeSent: Boolean(t.codeSentAt),
    createdByName: t.createdByName,
    assignments: t.assignments.map((a) => ({
      childId: a.child.id,
      childName: a.child.name,
      subject: a.subject,
    })),
  };
}
