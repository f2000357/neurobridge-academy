import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { gatherReport, canReport, sinceForRange, rangeLabel } from "@/lib/report";
import { tutorJson, aiEnabled } from "@/lib/ai";

type Narrative = {
  overview: string;
  strengths: string[];
  growthAreas: string[];
  nextSteps: string[];
};

// Generate an AI progress-report narrative for a learner, grounded in their data.
export async function POST(req: NextRequest) {
  const { childId, range } = (await req.json()) as { childId: string; range?: string };
  const me = await getCurrentUser();
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { teacherId: true, centerId: true },
  });
  if (!child) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canReport(me, child))) return NextResponse.json({ error: "not allowed" }, { status: 403 });

  const data = await gatherReport(childId, sinceForRange(range));
  if (!data) return NextResponse.json({ error: "no data" }, { status: 404 });

  const fallback: Narrative = {
    overview: `${data.child.name} has completed ${data.lessonsCompleted} lesson${data.lessonsCompleted === 1 ? "" : "s"} and earned ${data.points.lifetime} points.`,
    strengths: data.subjects.filter((s) => s.level === "proficient").map((s) => `Strong in ${s.subject}`),
    growthAreas: data.subjects.filter((s) => s.level === "emerging").map((s) => `Keep building ${s.subject}`),
    nextSteps: ["Continue the current plan.", "Revisit skills that are still emerging."],
  };
  if (!aiEnabled) return NextResponse.json({ narrative: fallback, ai: false });

  const narrative = await tutorJson<Narrative>(
    "You write a warm, honest progress report for a parent or educator about a neurodiverse learner. Ground EVERYTHING strictly in the data provided — never invent scores or skills. Be specific, encouraging, and truthful; name real strengths and real growth areas. Plain language, no jargon.",
    `Write a progress report covering ${rangeLabel(range)} from this data. JSON: {"overview": "3-4 sentence summary of how they're doing overall", ` +
      `"strengths": ["2-4 specific strengths grounded in the data"], ` +
      `"growthAreas": ["2-4 areas to keep working on"], ` +
      `"nextSteps": ["2-4 concrete recommended next steps"]}. ` +
      `Data: ${JSON.stringify(data)}`,
    1200,
    "plan"
  );

  return NextResponse.json({ narrative: narrative ?? fallback, ai: aiEnabled });
}
