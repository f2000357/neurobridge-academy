import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Neurable-admin actions: stand up centers and staff accounts.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };
  const me = await getCurrentUser();
  if (!me || me.role !== "neurable_admin") {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  if (op === "createCenter") {
    const { name, region } = body as { name: string; region?: string };
    if (!name?.trim()) return NextResponse.json({ error: "Name the center." }, { status: 400 });
    const center = await prisma.center.create({ data: { name: name.trim(), region: region?.trim() || "" } });
    await prisma.auditLog.create({
      data: { actorId: me.id, actorName: me.name, action: "create_center", detail: center.name },
    });
    return NextResponse.json({ ok: true, id: center.id });
  }

  if (op === "createUser") {
    const { name, email, role, centerId } = body as {
      name: string;
      email?: string;
      role: string;
      centerId?: string;
    };
    if (!name?.trim()) return NextResponse.json({ error: "Name the staff member." }, { status: 400 });
    if (!["center_admin", "guide"].includes(role)) {
      return NextResponse.json({ error: "Pick a role." }, { status: 400 });
    }
    if (!centerId) return NextResponse.json({ error: "Pick a center." }, { status: 400 });
    if (email?.trim()) {
      const clash = await prisma.user.findUnique({ where: { email: email.trim() } });
      if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 400 });
    }
    const user = await prisma.user.create({
      data: { name: name.trim(), email: email?.trim() || null, role, centerId },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        actorName: me.name,
        action: "create_user",
        detail: `${user.name} (${role})`,
      },
    });
    return NextResponse.json({ ok: true, id: user.id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
