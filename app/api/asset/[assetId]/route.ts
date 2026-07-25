import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { resolveUpload } from "@/lib/uploads";

// Images attached to a lesson step. Unlike a child's photos, these are teaching
// material — a diagram of fractions, a photo of a worked example — so any child
// running the lesson needs them, as does every operator previewing it.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.lessonAsset.findUnique({ where: { id: assetId } });
  if (!asset) return new NextResponse("Not found", { status: 404 });

  const abs = resolveUpload(asset.path);
  if (!abs) return new NextResponse("Not found", { status: 404 });
  let size: number;
  try {
    size = statSync(abs).size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
