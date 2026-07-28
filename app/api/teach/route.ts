import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTeacherCode } from "@/lib/specialists";
import { getCurrentTeacher, teacherCanSee, TEACHER_COOKIE } from "@/lib/teacherAuth";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, putObject, deleteObject, storageConfigured } from "@/lib/storage";

// Said when a specialist reaches for something on a learner who is no longer
// assigned to them. Their notes remain; they simply stop being theirs to change.
const NOT_THEIRS_ANY_MORE =
  "This learner isn't assigned to you any more, so their record is read-only for you.";

// The visiting specialist's own API: sign in with a code, then read only what
// their live assignments allow and write notes about it.

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // Photo/video upload arrives as multipart, everything else as JSON.
  if (contentType.includes("multipart/form-data")) {
    return handleUpload(req);
  }

  const body = await req.json();
  const { op } = body as { op: string };

  if (op === "signIn") {
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!isTeacherCode(code)) {
      return NextResponse.json({ error: "That doesn't look like a teacher code." }, { status: 400 });
    }
    const teacher = await prisma.specialistTeacher.findUnique({ where: { code } });
    if (!teacher || teacher.archived) {
      return NextResponse.json({ error: "That code isn't recognised." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, name: teacher.name });
    res.cookies.set(TEACHER_COOKIE, teacher.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  if (op === "signOut") {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(TEACHER_COOKIE);
    return res;
  }

  const teacher = await getCurrentTeacher();
  if (!teacher) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  if (op === "saveNote") {
    const { childId, noteId, slotId, date } = body as {
      childId: string;
      noteId?: string;
      slotId?: string | null;
      date: string;
    };
    if (!(await teacherCanSee(teacher.id, childId))) {
      return NextResponse.json({ error: "not your learner" }, { status: 403 });
    }
    const grant = await prisma.teacherAssignment.findUnique({
      where: { teacherId_childId: { teacherId: teacher.id, childId } },
    });

    // A specialist's authority stops at the activity they govern. They can see the
    // child's whole day for context, but may only write up their OWN sessions —
    // a block assigned to them, or one whose activity is theirs. (A note with no
    // slot is a general observation and always allowed.)
    if (slotId) {
      const slot = await prisma.scheduleSlot.findUnique({
        where: { id: slotId },
        select: { childId: true, activity: true, teacherId: true },
      });
      // Only the person the parent put on this block. Matching on activity
      // instead would let one of a child's three piano teachers write up
      // another's session.
      const isTheirs = slot?.childId === childId && slot.teacherId === teacher.id;
      if (!isTheirs) {
        return NextResponse.json(
          { error: "That session isn't yours to write up." },
          { status: 403 }
        );
      }
    }
    const data = {
      whatWeDid: String(body.whatWeDid ?? "").trim(),
      wentWell: String(body.wentWell ?? "").trim(),
      struggledWith: String(body.struggledWith ?? "").trim(),
      nextTime: String(body.nextTime ?? "").trim(),
      focus: body.focus == null || body.focus === "" ? null : Number(body.focus),
    };
    if (!data.whatWeDid) {
      return NextResponse.json({ error: "Say what you worked on, at least." }, { status: 400 });
    }

    if (noteId) {
      // Only the author may edit their own note.
      const own = await prisma.teacherNote.findFirst({ where: { id: noteId, teacherId: teacher.id } });
      if (!own) return NextResponse.json({ error: "not your note" }, { status: 403 });
      const note = await prisma.teacherNote.update({ where: { id: noteId }, data });
      return NextResponse.json({ ok: true, noteId: note.id });
    }

    const note = await prisma.teacherNote.create({
      data: {
        childId,
        teacherId: teacher.id,
        slotId: slotId || null,
        date,
        subject: grant?.subject || teacher.specialty,
        ...data,
      },
    });
    return NextResponse.json({ ok: true, noteId: note.id });
  }

  if (op === "deleteMedia") {
    const { mediaId } = body as { mediaId: string };
    const media = await prisma.teacherMedia.findUnique({
      where: { id: mediaId },
      include: { note: true },
    });
    if (!media || media.note.teacherId !== teacher.id) {
      return NextResponse.json({ error: "not yours" }, { status: 403 });
    }
    // The learner is no longer theirs — the record is closed to them.
    if (!(await teacherCanSee(teacher.id, media.note.childId))) {
      return NextResponse.json({ error: NOT_THEIRS_ANY_MORE }, { status: 403 });
    }
    await prisma.teacherMedia.delete({ where: { id: mediaId } });
    // The row used to go without the object, leaving a paid-for orphan in the
    // bucket that nothing referenced.
    await deleteObject(media.path);
    return NextResponse.json({ ok: true });
  }

  // A specialist removing a note they wrote.
  //
  // Only while the learner is still theirs. Once a family unassigns them the
  // record is closed: notes stay because they are the child's record and the
  // evidence behind a review, and someone on their way out must not be able to
  // thin that out. `teacherCanSee` is the whole rule — it is false the moment
  // the assignment is gone.
  if (op === "deleteNote") {
    const { noteId } = body as { noteId: string };
    const own = await prisma.teacherNote.findFirst({
      where: { id: noteId, teacherId: teacher.id },
      select: { id: true, childId: true },
    });
    if (!own) return NextResponse.json({ error: "That note isn't yours." }, { status: 403 });
    if (!(await teacherCanSee(teacher.id, own.childId))) {
      return NextResponse.json({ error: NOT_THEIRS_ANY_MORE }, { status: 403 });
    }
    const files = await prisma.teacherMedia.findMany({
      where: { noteId },
      select: { path: true },
    });
    await prisma.teacherNote.delete({ where: { id: noteId } });
    // Best-effort, as elsewhere: the row is gone either way, and an orphaned
    // object is cheaper than a delete that fails halfway.
    for (const f of files) await deleteObject(f.path);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

/** What to tell someone when the upload could not be stored. */
function uploadError(reason: string): string {
  return storageConfigured()
    ? "That didn't upload. Try again in a moment."
    : "Photos and videos aren't set up on this deployment yet.";
}

// A photo of the finished painting, or a short video of the swim stroke.
async function handleUpload(req: NextRequest) {
  const teacher = await getCurrentTeacher();
  if (!teacher) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const form = await req.formData();
  const noteId = String(form.get("noteId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  const note = await prisma.teacherNote.findFirst({ where: { id: noteId, teacherId: teacher.id } });
  if (!note) return NextResponse.json({ error: "not your note" }, { status: 403 });


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
    // Say so rather than creating a row pointing at nothing — a note claiming a
    // video that will not play is worse than a failed upload.
    return NextResponse.json({ error: uploadError(put.reason) }, { status: 502 });
  }
  const media = await prisma.teacherMedia.create({
    data: {
      noteId: note.id,
      filename: file.name || (isVideo ? "clip.mp4" : "photo.jpg"),
      mimeType: file.type,
      kind: isVideo ? "video" : "image",
      bytes: file.size,
      path: put.key,
      caption: String(form.get("caption") ?? ""),
    },
  });
  return NextResponse.json({ ok: true, media: { id: media.id, kind: media.kind } });
}
