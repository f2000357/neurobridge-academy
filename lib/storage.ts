// Where photos and videos actually live.
//
// They used to be written to disk under .uploads/. That works locally and is
// quietly broken on Vercel: the filesystem is ephemeral, so an upload survives
// until the next deploy, and one serverless instance may not even see what
// another wrote. The upload appears to succeed, the row is created, and the
// file 404s later — the worst kind of failure, because nobody finds out until
// a parent goes looking for a video of their child.
//
// So objects go to Supabase Storage, in a PRIVATE bucket. Nothing is ever
// served straight from it: /api/media/[mediaId] authorizes the caller first and
// only then hands out a short-lived signed URL. Supabase carries the bytes —
// streaming a 60MB video through a serverless function is a good way to hit
// every limit at once — but the decision about who may see it stays here.
//
// Provider-agnostic on purpose, like lib/email: one file knows about Supabase.

import { randomUUID } from "node:crypto";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "child-media";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // 60 MB — a couple of minutes

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function storageConfigured(): boolean {
  return Boolean(URL_BASE && SERVICE_KEY);
}

export type PutResult = { ok: true; key: string } | { ok: false; reason: string };

/**
 * Upload one file and return its object key.
 *
 * The key is `<childId>/<uuid>.<ext>`: random, so the original filename never
 * reaches storage, and child-scoped so a stray key can always be traced back.
 */
export async function putObject(file: File, childId: string): Promise<PutResult> {
  if (!URL_BASE || !SERVICE_KEY) {
    return { ok: false, reason: "storage is not configured — no SUPABASE_SERVICE_ROLE_KEY" };
  }
  const key = `${childId}/${randomUUID()}.${EXT[file.type] ?? "bin"}`;
  try {
    const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: file,
    });
    if (!res.ok) {
      return { ok: false, reason: `storage ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true, key };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * A URL that works for `seconds` and then doesn't.
 *
 * Short by default: long enough to load a video, not long enough to be a link
 * someone forwards. Authorization already happened before we got here.
 */
export async function signedUrl(key: string, seconds = 120): Promise<string | null> {
  if (!URL_BASE || !SERVICE_KEY) return null;
  try {
    const res = await fetch(`${URL_BASE}/storage/v1/object/sign/${BUCKET}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: seconds }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
    const rel = data.signedURL ?? data.signedUrl;
    return rel ? `${URL_BASE}/storage/v1${rel.startsWith("/") ? "" : "/"}${rel}` : null;
  } catch {
    return null;
  }
}

/** Remove an object. Best-effort: a failure here must not block deleting a note. */
export async function deleteObject(key: string): Promise<void> {
  if (!URL_BASE || !SERVICE_KEY) return;
  try {
    await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
  } catch {
    // The row goes either way; an orphaned object is cheaper than a broken delete.
  }
}
