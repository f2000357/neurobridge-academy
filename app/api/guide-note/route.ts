import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardOperate } from "@/lib/authz";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, putObject, deleteObject, storageConfigured } from "@/lib/storage";

// A guide writing a session note.
//
// The mirror of /api/teach for the other kind of author. A parent running most
// of their child's day had no way to record any of it: notes required a
// SpecialistTeacher, and a guide is a User. Both are first class now.
//
// Kept as its own route rather than a branch inside /api/teach, because the two
// authenticate completely differently — a specialist by one-time link cookie, a
// guide by session — and mixing those in one handler is how auth bugs happen.

const FIELDS = ["whatWeDid", "wentWell", "struggledWith", "nextTime"] as const;

export async function POST(req: NextRequest) {
  // A photo or a clip from a session the guide ran themselves. Same capability
  // a visiting specialist has had — the parent teaching most of the week should
  // not have to hand their child's day to a therapist to have it recorded.
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    return handleUpload(req);
  }

  const body = await req.json();
  const { op } = body as { op: string };
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (op === "saveNote") {
    const { childId, slotId, noteId, date, subject } = body as {
      childId: string;
      slotId?: string;
      noteId?: string;
      date: string;
      subject?: string;
    };
    const denied = await guardOperate(childId);
    if (denied) return denied;

    const data: Record<string, string> = {};
    for (const f of FIELDS) {
      data[f] = String((body as Record<string, unknown>)[f] ?? "").trim().slice(0, 2000);
    }
    if (!Object.values(data).some(Boolean)) {
      return NextResponse.json({ error: "Write something first." }, { status: 400 });
    }

    // A session note has to belong to this child's day.
    if (slotId) {
      const slot = await prisma.scheduleSlot.findUnique({
        where: { id: slotId },
        select: { childId: true, activity: true },
      });
      if (slot?.childId !== childId) {
        return NextResponse.json({ error: "That session isn\'t theirs." }, { status: 403 });
      }
    }

    if (noteId) {
      // Only the guide who wrote it may edit it — not another guide, and never
      // a specialist's note.
      const own = await prisma.teacherNote.findFirst({
        where: { id: noteId, authorUserId: me.id },
        select: { id: true },
      });
      if (!own) return NextResponse.json({ error: "That note isn\'t yours to edit." }, { status: 403 });
      await prisma.teacherNote.update({ where: { id: noteId }, data });
      return NextResponse.json({ ok: true, noteId });
    }

    const note = await prisma.teacherNote.create({
      data: {
        childId,
        authorUserId: me.id,
        teacherId: null,
        slotId: slotId || null,
        date,
        subject: subject || "",
        ...data,
      },
    });
    return NextResponse.json({ ok: true, noteId: note.id });
  }

  if (op === "deleteNote") {
    const { noteId } = body as { noteId: string };
    const own = await prisma.teacherNote.findFirst({
      where: { id: noteId, authorUserId: me.id },
      select: { id: true, childId: true },
    });
    if (!own) return NextResponse.json({ error: "That note isn\'t yours." }, { status: 403 });
    const denied = await guardOperate(own.childId);
    if (denied) return denied;
    const files = await prisma.teacherMedia.findMany({
      where: { noteId },
      select: { path: true },
    });
    await prisma.teacherNote.delete({ where: { id: noteId } });
    // Best-effort: the row is gone either way, and an orphaned object is
    // cheaper than a delete that fails halfway.
    for (const f of files) await deleteObject(f.path);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

async function handleUpload(req: NextRequest): Promise<NextResponse> {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await req.formData();
  const noteId = String(form.get("noteId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  // A moment during a block, the same way a specialist adds one.
  //
  // This used to demand a note you had already written, so a guide running a
  // six-hour camp day had to compose a write-up before they could keep a
  // photograph. Naming the BLOCK is enough; the note is found or opened here.
  const slotId = String(form.get("slotId") ?? "");
  const childId = String(form.get("childId") ?? "");
  let note = noteId
    ? await prisma.teacherNote.findFirst({
        where: { id: noteId, authorUserId: me.id },
        select: { id: true, childId: true },
      })
    : null;
  if (!note && slotId && childId) {
    const denied = await guardOperate(childId);
    if (denied) return denied;
    const slot = await prisma.scheduleSlot.findUnique({
      where: { id: slotId },
      select: { childId: true, date: true, subject: true, activity: true },
    });
    if (!slot || slot.childId !== childId) {
      return NextResponse.json({ error: "That block isn't on this learner's day." }, { status: 404 });
    }
    note =
      (await prisma.teacherNote.findFirst({
        where: { slotId, authorUserId: me.id },
        select: { id: true, childId: true },
      })) ??
      (await prisma.teacherNote.create({
        data: {
          childId,
          slotId,
          authorUserId: me.id,
          teacherId: null,
          date: slot.date,
          subject: slot.subject || slot.activity || "",
          whatWeDid: "",
        },
        select: { id: true, childId: true },
      }));
  }
  if (!note) return NextResponse.json({ error: "That note isn't yours." }, { status: 403 });

  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) {
    return NextResponse.json({ error: "Only photos and videos, please." }, { status: 400 });
  }
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    return NextResponse.json(
      { error: `That ${isVideo ? "video" : "photo"} is too large — keep it under ${mb} MB.` },
      { status: 413 }
    );
  }

  const put = await putObject(file, note.childId);
  if (!put.ok) {
    return NextResponse.json(
      {
        error: storageConfigured()
          ? "That didn't upload. Try again in a moment."
          : "Photos and videos aren't set up on this deployment yet.",
      },
      { status: 502 }
    );
  }

  const media = await prisma.teacherMedia.create({
    data: {
      noteId: note.id,
      filename: file.name || (isVideo ? "clip.mp4" : "photo.jpg"),
      mimeType: file.type,
      kind: isVideo ? "video" : "image",
      bytes: file.size,
      path: put.key,
      caption: String(form.get("caption") ?? "").slice(0, 200),
    },
  });
  return NextResponse.json({ ok: true, mediaId: media.id });
}
