import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Dev "auth": the current operator is remembered in a cookie set by the role
// switcher. Real sign-in (email/password or SSO) replaces this at launch.
const COOKIE = "nb_user";

export async function getCurrentUserId(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (u) return u.id;
  }
  // Fallback: the first guide, so the app is usable before anyone "signs in".
  const guide = await prisma.user.findFirst({ where: { role: "guide" }, orderBy: { name: "asc" } });
  return guide?.id ?? null;
}

// Returns the current user. Generic over Prisma args so include/select typing
// flows through exactly like prisma.user.findUnique.
export async function getCurrentUser<T extends Prisma.UserDefaultArgs>(
  args?: Prisma.SelectSubset<T, Prisma.UserDefaultArgs>
): Promise<Prisma.UserGetPayload<T> | null> {
  const id = await getCurrentUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, ...((args ?? {}) as object) }) as Promise<
    Prisma.UserGetPayload<T> | null
  >;
}

export function homeForRole(role: string | undefined): string {
  if (role === "neurable_admin") return "/admin";
  if (role === "center_admin") return "/center";
  return "/teacher";
}

export function roleLabel(role: string | undefined): string {
  if (role === "neurable_admin") return "Neurable Admin";
  if (role === "center_admin") return "Center Admin";
  return "Guide";
}
