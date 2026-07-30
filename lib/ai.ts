import Anthropic from "@anthropic-ai/sdk";
import type { ChildProfile } from "@prisma/client";

const key = process.env.ANTHROPIC_API_KEY;
export const aiEnabled = Boolean(key && key !== "your-key-here");
const client = aiEnabled ? new Anthropic({ apiKey: key }) : null;

// Model tiers, chosen by stakes x frequency x latency:
//   deep — rare, high-stakes, irreversible reasoning (reading a child's IEP /
//          evaluation to propose their whole program; drafting a lesson).
//          Latency and cost don't matter; being right does.
//   plan — quality work the child or guide waits briefly on: in-lesson teaching,
//          weekly plans, progress reports.
//   fast — trivial, high-frequency turns where latency = lost attention.
const DEEP_MODEL = "claude-opus-4-8";
const PLAN_MODEL = "claude-sonnet-5";
const FAST_MODEL = "claude-haiku-4-5-20251001";

export function tutorSystem(childName: string, profile: ChildProfile | null): string {
  const p = profile;
  return [
    `You are the NeuroBridge tutor: a patient, gentle 1-on-1 tutor for ${childName}, a neurodiverse learner.`,
    `Reading level: ${p?.readingLevel ?? "grade-3"}. Use ${p?.sentenceStyle ?? "short"} sentences.`,
    p?.literalLanguage !== false
      ? "Use literal language only — no idioms, no figures of speech, no sarcasm."
      : "",
    p?.interests
      ? `When it helps, use examples from their interests: ${p.interests}.`
      : "",
    "Rules: one idea at a time. Never rush. Never shame. Celebrate effort specifically, not with empty praise. If they are wrong, be kind and concrete about the next small step.",
    "Write in plain text only. No Markdown, no asterisks, no headings, no bullet symbols, no emoji unless it is a single friendly one at the very start. Just warm, simple sentences.",
    p?.neverDo ? `Hard rules from their guide — never do these: ${p.neverDo}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type Kind = "fast" | "plan" | "deep";
const modelFor = (kind: Kind) =>
  kind === "deep" ? DEEP_MODEL : kind === "plan" ? PLAN_MODEL : FAST_MODEL;

export async function tutorText(
  system: string,
  user: string,
  maxTokens = 400,
  kind: Kind = "fast"
): Promise<string | null> {
  if (!client) return null;
  try {
    const msg = await client.messages.create({
      model: modelFor(kind),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    // Running out of room mid-answer produces text that looks fine and parses
    // as nothing. Say so, or every caller reports the same useless "try again".
    if (msg.stop_reason === "max_tokens") {
      console.error(
        `Claude call hit max_tokens (${maxTokens}) on ${modelFor(kind)} — the answer was cut off.`
      );
    }
    const block = msg.content.find((b) => b.type === "text");
    return block?.type === "text" ? block.text.trim() : null;
  } catch (err) {
    console.error("Claude call failed:", err);
    return null;
  }
}

// Read uploaded documents (PDF / image / text) and return structured JSON.
// Each doc is turned into the right Anthropic content block so Claude reads it natively.
export type DocInput = { mimeType: string; data: string; filename: string };

// Reads a child's own documents (IEP, evaluation) to propose their program.
// The highest-stakes call in the product — runs on the deep tier.
export async function planJsonFromDocs<T>(
  system: string,
  instruction: string,
  docs: DocInput[],
  maxTokens = 1800,
  kind: Kind = "deep"
): Promise<T | null> {
  if (!client) return null;

  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const d of docs) {
    const mt = d.mimeType.toLowerCase();
    if (mt === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: d.data },
      });
    } else if (mt.startsWith("image/")) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mt as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: d.data,
        },
      });
    } else {
      // Treat everything else as text.
      const text = Buffer.from(d.data, "base64").toString("utf8");
      blocks.push({ type: "text", text: `--- Document: ${d.filename} ---\n${text}` });
    }
  }
  blocks.push({
    type: "text",
    text: instruction + "\nRespond with ONLY a valid JSON object, no other text.",
  });

  try {
    const msg = await client.messages.create({
      model: modelFor(kind),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: blocks }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block?.type === "text" ? block.text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch (err) {
    console.error("Claude document call failed:", err);
    return null;
  }
}

// For ops that need structured output (worksheet questions, answer checks, plans).
export async function tutorJson<T>(
  system: string,
  user: string,
  maxTokens = 400,
  kind: Kind = "fast"
): Promise<T | null> {
  const text = await tutorText(
    system + "\nRespond with ONLY a valid JSON object, no other text.",
    user,
    maxTokens,
    kind
  );
  if (!text) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    console.error("Failed to parse tutor JSON:", text);
    return null;
  }
}
