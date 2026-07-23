import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sessionUserId } from "./session";

// Real operator auth: identity comes from the signed session cookie (see
// lib/session). No session means no operator — there is no anonymous fallback.

export async function getCurrentUserId(): Promise<string | null> {
  const id = await sessionUserId();
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  return u?.id ?? null;
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
