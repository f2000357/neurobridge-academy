import { cookies } from "next/headers";
import { prisma } from "./prisma";

// A visiting specialist signs in with their code and nothing else. The cookie
// holds the teacher id; every read is re-checked against live assignments, so
// removing a learner takes effect on the next request.

const COOKIE = "nb_teacher";

export async function getCurrentTeacher() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const teacher = await prisma.specialistTeacher.findUnique({ where: { id } });
  if (!teacher || teacher.archived) return null;
  return teacher;
}

/** The learners this specialist may see right now. */
export async function teacherRoster(teacherId: string) {
  const assignments = await prisma.teacherAssignment.findMany({
    where: { teacherId, child: { archived: false } },
    include: { child: { select: { id: true, name: true, age: true } } },
    orderBy: { createdAt: "asc" },
  });
  return assignments.map((a) => ({
    childId: a.child.id,
    name: a.child.name,
    age: a.child.age,
    subject: a.subject,
  }));
}

/** Guard: is this specialist still assigned to this learner? */
export async function teacherCanSee(teacherId: string, childId: string): Promise<boolean> {
  const grant = await prisma.teacherAssignment.findUnique({
    where: { teacherId_childId: { teacherId, childId } },
  });
  return Boolean(grant);
}

export const TEACHER_COOKIE = COOKIE;
