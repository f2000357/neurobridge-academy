import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tutorSystem, tutorText, tutorJson, aiEnabled } from "@/lib/ai";

// One endpoint for all in-lesson tutor operations. Every op degrades to a
// calm scripted fallback when no API key is configured, so the app always works.

type WorksheetQ = { question: string; answer: string };
type Verdict = { correct: boolean; feedback: string };

// Keep fallback passages short — one small idea at a time.
function shorten(text: string, maxSentences = 3): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .slice(0, maxSentences)
    .join(" ")
    .trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op, childId } = body as { op: string; childId: string };

  // childId may be absent (previewing a shared lesson): fall back to a generic student.
  const child = childId
    ? await prisma.child.findUnique({ where: { id: childId }, include: { profile: true } })
    : null;
  const childName = child?.name ?? "there";

  const system = tutorSystem(childName, child?.profile ?? null);

  if (op === "ground") {
    const { title, goal, why, steps, durationMin, after } = body;
    const fallback =
      `Hi ${childName}! Today we are doing: ${goal || title}.` +
      (why ? ` Why? ${why}` : "") +
      ` We will go step by step — you can see the steps on the left. It takes about ${durationMin} minutes.` +
      (after ? ` When we finish, next is: ${after}.` : "") +
      " Take your time. Press the button when you feel ready.";
    const text = await tutorText(
      system,
      `Start the lesson grounding ritual. Lesson: "${title}". Goal: "${goal}". Why it matters: "${why}". Steps: ${JSON.stringify(steps)}. Duration: ${durationMin} minutes. Afterwards comes: "${after || "a break"}". In 3-5 short sentences: greet ${childName} warmly, say what we're doing and why, mention the visible steps and the time, and what comes after. End by inviting them to press "I'm ready" when they feel ready.`
    );
    return NextResponse.json({ text: text ?? fallback, ai: aiEnabled });
  }

  if (op === "teach") {
    const { chunk, lessonTitle, goal } = body;
    const isVideo = chunk.type === "video";
    const source = chunk.content || chunk.videoNote || chunk.title || "";
    const topic = chunk.title || lessonTitle || goal || "this";
    const fallback = isVideo
      ? `Now let's watch a short video. It is about ${topic}. Watch carefully!`
      : shorten(source || `Let's learn about ${topic}. ${goal || ""}`.trim());
    const text = await tutorText(
      system,
      `You are teaching one small step of the lesson "${lessonTitle}" (goal: ${goal || "help the child learn"}). ` +
        `ALWAYS teach the child directly — NEVER say the step is missing a title or content, and NEVER ask for more information. ` +
        `If details are thin, teach the concept from the step title and the lesson goal. ` +
        `Use AT MOST 3 very short sentences — one small idea only. ` +
        (isVideo
          ? `This step is a short VIDEO. In 1-2 warm sentences, tell the child they will watch a short video and what it is about. Video description: "${chunk.videoNote || topic}".`
          : `End with a gentle check like "Does that make sense?". Step title: "${chunk.title || topic}". Step notes: "${source}". Step type: ${chunk.type}.`)
    );
    return NextResponse.json({ text: text ?? fallback, ai: aiEnabled });
  }

  if (op === "simplify") {
    const content = String(body.content ?? "");
    const fallback = shorten(content, 2);
    const text = await tutorText(
      system,
      `Rewrite this much simpler for ${childName}. Use AT MOST 2 very short sentences and the easiest words. Keep only the main idea: "${content}"`
    );
    return NextResponse.json({ text: text ?? fallback, ai: aiEnabled });
  }

  if (op === "worksheet_question") {
    const { lessonTitle, goal, questionNum, totalQuestions, seedQuestion, seedAnswer, difficulty, challenge } = body;
    const fallbackQ: WorksheetQ = {
      question: seedQuestion || "What is 1/4 + 2/4?",
      answer: seedQuestion ? seedAnswer ?? "" : "3/4",
    };
    const level = Number(difficulty ?? 3); // 1 easy … 5 hard
    const levelWord =
      level <= 1 ? "very easy" : level === 2 ? "easy" : level === 3 ? "medium" : level === 4 ? "harder" : "hard";
    const ask = challenge
      ? `Create CHALLENGE question ${questionNum} of ${totalQuestions} for the lesson "${lessonTitle}" (goal: ${goal}). Make it genuinely harder / a stretch — it is worth extra points.`
      : `Create question ${questionNum} of ${totalQuestions} for the lesson "${lessonTitle}" (goal: ${goal}). Difficulty: ${levelWord}.`;
    const q = await tutorJson<WorksheetQ>(
      system,
      `${ask} One short question with one short, definite answer. Keep the wording simple even when the concept is harder. JSON: {"question": "...", "answer": "..."}`
    );
    return NextResponse.json({ ...(q ?? fallbackQ), ai: aiEnabled });
  }

  if (op === "check_answer") {
    const { question, expected, studentAnswer } = body;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const fallbackVerdict: Verdict =
      expected && norm(studentAnswer) === norm(expected)
        ? { correct: true, feedback: "Yes! That's right. Nice careful work." }
        : {
            correct: false,
            feedback: expected
              ? `Not quite — the answer is ${expected}. Let's look at it together on the next one.`
              : "Thank you for trying! Let's keep going.",
          };
    const v = await tutorJson<Verdict>(
      system,
      `Question: "${question}". Expected answer: "${expected}". ${childName} answered: "${studentAnswer}". Is it right (accept equivalent forms)? Reply JSON: {"correct": true/false, "feedback": "1-2 kind sentences — if wrong, one concrete hint, never shame"}`
    );
    return NextResponse.json({ ...(v ?? fallbackVerdict), ai: aiEnabled });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
