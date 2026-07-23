import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStandards, DEFAULT_STANDARDS } from "@/lib/standards";
import { tutorJson, aiEnabled } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { guardOperate, guardOperatorPresent } from "@/lib/authz";

// The teacher's lesson builder backend: draft a plan with AI, then persist it.

type DraftChunk = {
  type: "read_text" | "visual" | "video" | "worksheet" | "wrap_up";
  title: string;
  content?: string;
  visual?: string;
  videoNote?: string;
  items?: number;
  seed_question?: string;
  seed_answer?: string;
};

type Draft = {
  title: string;
  goal: string;
  whyItMatters: string;
  standardCode: string;
  standardText: string;
  chunks: DraftChunk[];
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "generate") {
    const { topic, subject, durationMin, childId, gradeLevel, curriculumTopic } = body;

    // A child-specific draft must be for a learner you manage; a generic draft
    // just needs a signed-in operator (it isn't tied to anyone yet).
    const denied = childId ? await guardOperate(childId) : await guardOperatorPresent();
    if (denied) return denied;

    // Personalize to the target child, if one is chosen (including which
    // standards framework they follow).
    let childContext = "";
    let stdCode: string = DEFAULT_STANDARDS;
    if (childId) {
      const child = await prisma.child.findUnique({
        where: { id: childId },
        include: { profile: true },
      });
      if (child) {
        stdCode = child.standardsCode;
        const p = child.profile;
        childContext = [
          `This lesson is for ${child.name}, a neurodiverse learner.`,
          `Reading level: ${p?.readingLevel ?? "grade-3"}, ${p?.sentenceStyle ?? "short"} sentences.`,
          p?.literalLanguage !== false ? "Use literal language, no idioms." : "",
          p?.interests ? `Weave in their interests where natural: ${p.interests}.` : "",
        ]
          .filter(Boolean)
          .join(" ");
      }
    }

    const std = getStandards(stdCode);
    const system = [
      "You design lesson plans for NeuroBridge, a calm school for neurodiverse learners.",
      "A plan is delivered chunk by chunk through an executive-functioning routine, so keep each chunk small, concrete, and in a sensible teaching order.",
      "Chunk types you may use:",
      "- read_text: a short passage to read (give 'content', 2-5 short sentences, plain language).",
      "- visual: describe a picture/diagram in 'content'; if it is fraction bars, number line, or a simple picture sequence, name it in 'visual'.",
      "- video: only if a short video would truly help. Do NOT invent a URL. Put a 'videoNote' describing what the teacher should find (the teacher will paste a link).",
      "- worksheet: interactive practice. Give 'items' (2-4), a 'seed_question' for the first question, and its 'seed_answer'.",
      "- wrap_up: a closing chunk (title only).",
      "Every plan must include a worksheet as an assessment near the end (the second-to-last chunk), then exactly one wrap_up chunk.",
      `Align the lesson to ${std.name} (${std.label}). Identify the single best-fit standard.`,
      "Write all learner-facing text in plain language, no Markdown.",
      childContext,
    ]
      .filter(Boolean)
      .join("\n");

    const grade = gradeLevel ? `Grade ${gradeLevel}` : "the appropriate grade";
    const strand = curriculumTopic ? ` within the strand "${curriculumTopic}"` : "";

    const draft = await tutorJson<Draft>(
      system,
      `Design a lesson for ${grade}${strand}. Topic: "${topic}". Subject: "${subject}". Target length: about ${durationMin} minutes. ` +
        `Return JSON: {"title": "short lesson title", "goal": "one concrete thing the learner will be able to do", "whyItMatters": "one friendly sentence a child understands", "standardCode": "the ${std.label} code, e.g. 3.NF.A.1", "standardText": "the standard in one plain sentence", "chunks": [ ... ]}. ` +
        `Use 3-6 chunks in a good order, including a worksheet assessment before the wrap_up.`,
      4000,
      "deep"
    );

    if (!draft) {
      return NextResponse.json(
        {
          ai: aiEnabled,
          error: aiEnabled
            ? "The AI draft could not be generated. Try again or write the plan by hand."
            : "AI is not configured. Add ANTHROPIC_API_KEY to draft with AI, or write the plan by hand.",
        },
        { status: aiEnabled ? 502 : 200 }
      );
    }

    return NextResponse.json({ ...draft, subject, durationMin, gradeLevel, topic: curriculumTopic, ai: aiEnabled });
  }

  if (op === "save") {
    const {
      id, title, subject, goal, whyItMatters, chunks, durationMin, childId, published,
      gradeLevel, topic, standardCode, standardText, visibility, workUrl,
    } = body;
    const teacher = await getCurrentUser();
    if (!teacher) return NextResponse.json({ error: "no teacher" }, { status: 400 });

    // Editing an existing plan: it must be yours (or you're NeuroBridge admin) —
    // otherwise the update below would silently reassign it to you.
    if (id) {
      const existing = await prisma.lessonPlan.findUnique({ where: { id }, select: { teacherId: true } });
      if (!existing) return NextResponse.json({ error: "lesson not found" }, { status: 404 });
      if (existing.teacherId !== teacher.id && teacher.role !== "neurable_admin") {
        return NextResponse.json({ error: "not your lesson" }, { status: 403 });
      }
    }
    // A child-specific lesson must be for a learner you manage.
    if (childId) {
      const denied = await guardOperate(childId);
      if (denied) return denied;
    }

    // Guides set private or center; a NeuroBridge admin can author global directly.
    const allowed = teacher.role === "neurable_admin"
      ? ["private", "center", "global"]
      : ["private", "center"];
    const vis = allowed.includes(visibility) ? visibility : "private";

    const data = {
      teacherId: teacher.id,
      centerId: teacher.centerId,
      visibility: vis,
      childId: childId || null,
      title,
      subject,
      goal,
      whyItMatters: whyItMatters ?? "",
      workUrl: (workUrl ?? "").trim(),
      gradeLevel: gradeLevel ?? "",
      topic: topic ?? "",
      standardCode: standardCode ?? "",
      standardText: standardText ?? "",
      chunks: typeof chunks === "string" ? chunks : JSON.stringify(chunks),
      durationMin: durationMin ?? 25,
      published: Boolean(published),
    };

    const plan = id
      ? await prisma.lessonPlan.update({ where: { id }, data })
      : await prisma.lessonPlan.create({ data });

    return NextResponse.json({ ok: true, id: plan.id });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
