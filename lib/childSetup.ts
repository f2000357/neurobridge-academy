import { prisma } from "./prisma";
import { usernameFrom } from "./username";

// A friendly, unique URL handle from the child's name (append a number if taken).
export async function uniqueUsername(name: string, excludeId?: string): Promise<string> {
  const base = usernameFrom(name);
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (
    await prisma.child.findFirst({
      where: { username: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

// The 8-digit code a learner enters at their own link.
export const newAccessCode = () => String(Math.floor(10000000 + Math.random() * 90000000));
