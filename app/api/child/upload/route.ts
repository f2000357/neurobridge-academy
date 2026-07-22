import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Accept one or more uploaded documents for a child (IEP, strengths list, etc.).
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file
const OK_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
];

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const childId = String(form.get("childId") ?? "");
  const kind = String(form.get("kind") ?? "other");
  const child = await prisma.child.findUnique({ where: { id: childId } });
  if (!child) return NextResponse.json({ error: "child not found" }, { status: 404 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "no files" }, { status: 400 });

  const saved: { id: string; filename: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name} is too large (max 8 MB).` }, { status: 400 });
    }
    const type = file.type || "text/plain";
    if (!OK_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `${file.name}: unsupported type. Use PDF, image, or text.` },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const doc = await prisma.childDocument.create({
      data: { childId, filename: file.name, mimeType: type, kind, data: buf.toString("base64") },
    });
    saved.push({ id: doc.id, filename: doc.filename });
  }

  return NextResponse.json({ ok: true, saved });
}
