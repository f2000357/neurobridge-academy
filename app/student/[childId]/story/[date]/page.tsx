import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { childIsAuthed } from "@/lib/report";
import { can } from "@/lib/authz";
import { getCurrentTeacher, teacherCanSee } from "@/lib/teacherAuth";
import { weekdayShort } from "@/lib/time";
import StoryPlayer, { type Moment } from "./StoryPlayer";

export const dynamic = "force-dynamic";

// One day, told back to the child.
//
// A six-hour block at a summer camp produces a morning of small moments, and a
// grid of thumbnails is the wrong way to give them back to a child who needs
// help holding a day together. This is the day in order, one thing at a time,
// big enough to look at: what he did, then what happened next.
//
// Anyone who may see the child may open it — him, his guides, and the
// specialist who was there. Media itself stays behind /api/media, which checks
// again per file.
export default async function StoryPage({
  params,
}: {
  params: Promise<{ childId: string; date: string }>;
}) {
  const { childId: handle, date } = await params;
  const child = await prisma.child.findFirst({
    where: { OR: [{ username: handle }, { id: handle }] },
    select: { id: true, name: true, username: true, accessCode: true },
  });
  if (!child) return <NotHere handle={handle} />;

  const teacher = await getCurrentTeacher();
  const allowed = teacher
    ? await teacherCanSee(teacher.id, child.id)
    : (await can(child.id, "view")) || (await childIsAuthed(child.id, child.accessCode));
  if (!allowed) return <NotHere handle={handle} />;

  const notes = await prisma.teacherNote.findMany({
    where: { childId: child.id, date, media: { some: {} } },
    include: {
      media: { orderBy: { createdAt: "asc" } },
      teacher: { select: { name: true } },
      slot: { select: { startMin: true, activity: true, subject: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const moments: Moment[] = notes
    .flatMap((n) =>
      n.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        caption: m.caption,
        at: m.createdAt.getTime(),
        who: n.teacher?.name ?? "",
        where: n.slot?.activity || n.slot?.subject || n.subject || "",
      }))
    )
    .sort((a, b) => a.at - b.at);

  const linkHandle = child.username ?? child.id;
  if (moments.length === 0) {
    return (
      <main className="page wrap" style={{ maxWidth: 560 }}>
        <h1>Nothing from that day yet</h1>
        <p className="muted">
          Photos and clips show up here once someone adds them.{" "}
          <Link href={`/student/${linkHandle}/story`}>See other days →</Link>
        </p>
      </main>
    );
  }

  return (
    <StoryPlayer
      childFirstName={child.name.split(" ")[0]}
      dayLabel={weekdayShort(date)}
      date={date}
      moments={moments}
      backHref={`/student/${linkHandle}`}
      allDaysHref={`/student/${linkHandle}/story`}
    />
  );
}

function NotHere({ handle }: { handle: string }) {
  return (
    <main className="page wrap">
      <h1>Not available</h1>
      <p className="muted">
        <Link href={`/student/${handle}`}>← Back</Link>
      </p>
    </main>
  );
}
