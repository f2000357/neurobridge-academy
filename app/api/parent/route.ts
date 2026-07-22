import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Parental gate: verify the PIN before letting a child's locked session exit.
export async function POST(req: NextRequest) {
  const { op, pin } = await req.json();

  if (op === "verifyPin") {
    const teacher = await getCurrentUser({ select: { pin: true } });
    const ok = Boolean(teacher && pin && String(pin) === teacher.pin);
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
