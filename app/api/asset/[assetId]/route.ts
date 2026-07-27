import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signedUrl, storageConfigured } from "@/lib/storage";

// Images attached to a lesson step. Unlike a child's photos, these are teaching
// material — a diagram of fractions, a photo of a worked example — so any child
// running the lesson needs them, as does every operator previewing it.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.lessonAsset.findUnique({ where: { id: assetId } });
  if (!asset) return new NextResponse("Not found", { status: 404 });

  // Same as note media: authorize here, then let storage carry the bytes
  // behind a link that expires.
  const url = await signedUrl(asset.path, 300);
  if (!url) {
    return new NextResponse(
      storageConfigured() ? "Could not fetch that file" : "Media storage is not configured",
      { status: storageConfigured() ? 502 : 503 }
    );
  }
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
}
