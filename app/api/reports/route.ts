import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { planJsonFromDocs, aiEnabled, type DocInput } from "@/lib/ai";
import { guardOperate } from "@/lib/authz";
import { nextMonday } from "@/lib/time";

// Importing a practice/assessment report (IXL or MAP) the guide exported and
// uploaded. The AI READS the file (these are graphical PDFs, not clean CSVs) and
// pulls out where the child needs work. Those focus areas feed next week's plan.
// The actual practice/videos stay on the provider — only results come back.

type Extracted = {
  provider?: string;
  summary: string;
  focus: { lane: string; subject: string; skill: string; questionsMissed?: number }[];
  mastery: { lane: string; note: string }[];
};

const LANES = "math | reading | writing | science";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "import") {
    const { childId, documentId, provider } = body as {
      childId: string;
      documentId?: string;
      provider?: string;
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;

    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: { name: true },
    });
    if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });

    // The specific uploaded report, or the most recent external report on file.
    const doc = documentId
      ? await prisma.childDocument.findFirst({ where: { id: documentId, childId } })
      : await prisma.childDocument.findFirst({
          where: { childId, kind: "external_report" },
          orderBy: { createdAt: "desc" },
        });
    if (!doc) {
      return NextResponse.json(
        { error: "Upload the exported IXL report first (as an external report)." },
        { status: 400 }
      );
    }
    if (!aiEnabled) {
      return NextResponse.json({ error: "AI is not configured, so the report can't be read yet." }, { status: 200 });
    }

    const docs: DocInput[] = [{ mimeType: doc.mimeType, data: doc.data, filename: doc.filename }];

    const result = await planJsonFromDocs<Extracted>(
      "You read practice-tool progress reports (IXL, MAP, and similar tools) and extract where a learner needs to work next. Be faithful to the report; do not invent skills. Plain text only.",
      `This is a progress/assessment report for ${child.name}. ` +
        `Find the section listing the skills the child needs the MOST support on (e.g. IXL's "areas to focus on", or the most questions missed / lowest scores). ` +
        `For each, map it to exactly one of our subject lanes: ${LANES} ` +
        `(IXL "ELA" splits into reading vs writing — reading/vocabulary/comprehension → reading; grammar/writing strategies → writing). ` +
        `Also give a one-sentence overall read, and a per-lane mastery snapshot (how strong the child looks in each lane the report covers). ` +
        `JSON: {"provider": "ixl|map", "summary": "one sentence", ` +
        `"focus": [{"lane": "${LANES}", "subject": "as shown", "skill": "skill name", "questionsMissed": number-or-null}], ` +
        `"mastery": [{"lane": "...", "note": "short phrase"}]}. ` +
        `List up to 12 focus skills, worst first.`,
      docs,
      4000,
      "deep"
    );

    if (!result || !Array.isArray(result.focus)) {
      return NextResponse.json(
        { error: "Couldn't read the results from that report. Try a clearer export." },
        { status: 502 }
      );
    }

    const weekStart = nextMonday();
    // One import per child per week — re-importing replaces it.
    await prisma.assessmentImport.deleteMany({ where: { childId, weekStart } });
    const saved = await prisma.assessmentImport.create({
      data: {
        childId,
        provider: (provider || result.provider || doc.kind || "ixl").toLowerCase().slice(0, 12),
        weekStart,
        summary: result.summary ?? "",
        focus: JSON.stringify(result.focus.slice(0, 12)),
        mastery: JSON.stringify(result.mastery ?? []),
      },
    });

    return NextResponse.json({
      ok: true,
      import: { id: saved.id, weekStart, summary: saved.summary, focus: result.focus.slice(0, 12) },
    });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
