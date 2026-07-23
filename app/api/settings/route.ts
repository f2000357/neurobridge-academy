import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// A guide saves their own linked-tool references (e.g. their IXL account URL).
export async function POST(req: NextRequest) {
  const { ixlUrl } = (await req.json()) as { ixlUrl?: string };
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  await prisma.user.update({
    where: { id: me.id },
    data: { ixlUrl: (ixlUrl ?? "").trim() },
  });
  return NextResponse.json({ ok: true });
}
