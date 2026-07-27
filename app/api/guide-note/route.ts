import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardOperate } from "@/lib/authz";

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
    await prisma.teacherNote.delete({ where: { id: noteId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
