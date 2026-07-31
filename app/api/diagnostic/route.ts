import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOperate } from "@/lib/authz";
import { planJsonFromDocs, aiEnabled } from "@/lib/ai";
import { fmtMin, weekdayShort, nextMonday } from "@/lib/time";

// The IXL Diagnostic, as a first step rather than a guess.
//
// Everything else in here infers where a child is from the handful of skills
// the planner happened to choose — a circular measurement, and the reason maths
// kept returning to the same strand. The Diagnostic measures every strand
// independently and returns a grade level for each, which is the thing the
// planner has never had.
//
// It is a real appointment, not a background job: it takes a while and is best
// split across sittings, so it goes into a flexible block on the timetable like
// anything else the child has to sit down and do.

export const DIAGNOSTIC_URL = "https://www.ixl.com/diagnostic";

// Subjects IXL's Diagnostic reports on, in our lanes.
const LANES = "math | reading | writing";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  // Free flexible blocks the diagnostic could go into.
  if (op === "slots") {
    const { childId, from } = body as { childId: string; from: string };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    const rows = await prisma.scheduleSlot.findMany({
      where: { childId, kind: "flexible", lessonPlanId: null, activity: "", date: { gte: from } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
      take: 20,
      select: { id: true, date: true, startMin: true, endMin: true },
    });
    return NextResponse.json({
      ok: true,
      slots: rows.map((s) => ({
        id: s.id,
        label: `${weekdayShort(s.date)} ${s.date} · ${fmtMin(s.startMin)}–${fmtMin(s.endMin)}`,
      })),
    });
  }

  // Put it on the day.
  //
  // Rather than invent a new block type, the chosen flexible block becomes a
  // lesson whose single step deep-links to the Diagnostic. The child then meets
  // it exactly like any other practice: open it, work, come back, press done —
  // and the score-reading and validation that already exist apply unchanged.
  if (op === "schedule") {
    const { childId, slotId, subject } = body as { childId: string; slotId: string; subject?: string };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    const slot = await prisma.scheduleSlot.findFirst({ where: { id: slotId, childId } });
    if (!slot) return NextResponse.json({ error: "That block isn't on this learner's week." }, { status: 404 });
    if (slot.lessonPlanId) {
      return NextResponse.json({ error: "That block already has something in it." }, { status: 400 });
    }
    const child = await prisma.child.findUnique({ where: { id: childId }, select: { teacherId: true, name: true } });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });

    const lane = (subject || "math").toLowerCase();
    const title = `IXL Diagnostic — ${lane}`;
    const plan = await prisma.lessonPlan.create({
      data: {
        teacherId: child.teacherId,
        childId,
        title,
        subject: lane,
        gradeLevel: "",
        topic: "Diagnostic",
        standardCode: "",
        standardText: "",
        goal: "Find out where to start",
        whyItMatters: "",
        workUrl: DIAGNOSTIC_URL,
        chunks: JSON.stringify([
          {
            type: "practice",
            title,
            provider: "ixl",
            videoUrl: "",
            practiceUrl: DIAGNOSTIC_URL,
            content:
              "This one isn't a test you can fail — it finds the right level to start you at. " +
              "Answer as well as you can, and if you don't know, say so rather than guessing. " +
              "You can stop and come back to it.",
          },
        ]),
        durationMin: Math.max(15, slot.endMin - slot.startMin),
        published: true,
      },
    });
    await prisma.scheduleSlot.update({
      where: { id: slotId },
      data: { kind: "lesson", subject: lane, lessonPlanId: plan.id },
    });
    return NextResponse.json({ ok: true, planId: plan.id, date: slot.date, startMin: slot.startMin });
  }

  // Read the Diagnostic's own results screen: a grade level per strand.
  //
  // This is the number the planner has been guessing at. Nothing is written
  // until the guide confirms — the same rule as every other read here.
  if (op === "read") {
    const { childId, imageBase64, mimeType } = body as {
      childId: string;
      imageBase64: string;
      mimeType: string;
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    if (!imageBase64) return NextResponse.json({ error: "No image received." }, { status: 400 });
    if (!aiEnabled) {
      return NextResponse.json({ error: "Reading results needs AI, which isn't switched on." }, { status: 503 });
    }

    const read = await planJsonFromDocs<{
      overall?: string | null;
      strands?: { lane: string; strand: string; level: string | null }[];
      note?: string | null;
    }>(
      "You read an IXL Diagnostic results screen and report the level it gives for each strand. " +
        "IXL shows levels as grade numbers, sometimes with a decimal (e.g. 320 on its own scale, or 'Grade 3'). " +
        "Report the GRADE it states, as a plain number or K. If a strand shows no level, return null for it. " +
        "Never invent a strand or a level.",
      `For each strand on this screen give its lane (${LANES}), the strand name as printed, and the grade level. ` +
        `Also the overall level per subject if one is shown. ` +
        `JSON: {"overall": "one short sentence naming the overall levels", ` +
        `"strands": [{"lane": "${LANES}", "strand": "as printed", "level": "3" or "K" or null}], ` +
        `"note": "anything unclear, or null"}`,
      [{ mimeType: mimeType || "image/jpeg", data: imageBase64, filename: "diagnostic.jpg" }],
      2000,
      "deep"
    );

    const strands = (read?.strands ?? []).filter((s) => s && s.strand);
    if (strands.length === 0) {
      return NextResponse.json({
        ok: true,
        read: false,
        reason: read?.note ?? "I couldn't find any levels on that screen — try the Diagnostic's own results page.",
      });
    }
    return NextResponse.json({
      ok: true,
      read: true,
      overall: read?.overall ?? "",
      strands,
      note: read?.note ?? "",
    });
  }

  // Keep it, once the guide has looked at it.
  if (op === "save") {
    const { childId, overall, strands } = body as {
      childId: string;
      overall?: string;
      strands: { lane: string; strand: string; level: string | null }[];
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;
    if (!Array.isArray(strands) || strands.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }
    const weekStart = nextMonday();
    await prisma.assessmentImport.deleteMany({ where: { childId, weekStart, provider: "ixl-diagnostic" } });
    await prisma.assessmentImport.create({
      data: {
        childId,
        provider: "ixl-diagnostic",
        weekStart,
        summary: overall || "IXL Diagnostic",
        // The planner reads `focus` as where to work; a strand below the child's
        // enrolled grade is exactly that.
        focus: JSON.stringify(
          strands
            .filter((s) => s.level)
            .map((s) => ({ lane: s.lane, subject: s.lane, skill: s.strand, questionsMissed: null, level: s.level }))
            .slice(0, 20)
        ),
        mastery: JSON.stringify(strands.map((s) => ({ lane: s.lane, note: `${s.strand}: ${s.level ?? "—"}` }))),
      },
    });
    return NextResponse.json({ ok: true, saved: strands.length });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
