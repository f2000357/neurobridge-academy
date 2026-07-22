import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/time";

// Mark a homework worksheet done and award points for it.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "complete") {
    const { homeworkId, correct, total } = body as {
      homeworkId: string;
      correct: number;
      total: number;
    };
    const hw = await prisma.homework.findUnique({ where: { id: homeworkId } });
    if (!hw) return NextResponse.json({ error: "not found" }, { status: 404 });

    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const points = correct; // homework: 1 point per correct answer

    await prisma.homework.update({
      where: { id: homeworkId },
      data: { status: "completed", score },
    });
    if (points > 0) {
      await prisma.pointEvent.create({
        data: { childId: hw.childId, points, kind: "homework", date: todayStr() },
      });
      await prisma.child.update({ where: { id: hw.childId }, data: { points: { increment: points } } });
    }
    return NextResponse.json({ ok: true, score, points });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
