import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Photos and videos live on disk, not in Postgres. A three-minute piano clip
// as base64 in a row would wreck every query that touches it.

export const UPLOAD_ROOT = path.join(process.cwd(), ".uploads");

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

/**
 * Write the file under .uploads/<childId>/ and return its path relative to the
 * upload root. Names are random: the original name never reaches the filesystem.
 */
export async function saveUpload(file: File, childId: string): Promise<{ path: string }> {
  const dir = path.join(UPLOAD_ROOT, childId);
  await mkdir(dir, { recursive: true });
  const ext = EXT[file.type] ?? "bin";
  const name = `${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, name), bytes);
  return { path: `${childId}/${name}` };
}

/**
 * Resolve a stored relative path to an absolute one, refusing anything that
 * tries to climb out of the upload root.
 */
export function resolveUpload(relPath: string): string | null {
  const abs = path.resolve(UPLOAD_ROOT, relPath);
  if (!abs.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return null;
  return abs;
}
