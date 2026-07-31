import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { childIsAuthed } from "@/lib/report";
import { can } from "@/lib/authz";
import { getCurrentTeacher, teacherCanSee } from "@/lib/teacherAuth";
import { weekdayShort } from "@/lib/time";

export const dynamic = "force-dynamic";

// Every day that has something to look back on.
//
// The point of keeping moments is being able to return to them — "what did you
// do at camp on Monday" is a question a child can answer with this open.
export default async function StoryIndex({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId: handle } = await params;
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
    where: { childId: child.id, media: { some: {} } },
    select: {
      date: true,
      subject: true,
      slot: { select: { activity: true, subject: true } },
      _count: { select: { media: true } },
    },
    orderBy: { date: "desc" },
  });

  const byDate = new Map<string, { count: number; what: Set<string> }>();
  for (const n of notes) {
    const d = byDate.get(n.date) ?? { count: 0, what: new Set<string>() };
    d.count += n._count.media;
    const what = n.slot?.activity || n.slot?.subject || n.subject;
    if (what) d.what.add(what);
    byDate.set(n.date, d);
  }
  const days = [...byDate.entries()];
  const linkHandle = child.username ?? child.id;

  return (
    <main className="page wrap" style={{ maxWidth: 620 }}>
      <p className="eyebrow">Looking back</p>
      <h1 style={{ margin: "4px 0 2px" }}>{child.name.split(" ")[0]}&apos;s days</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Days someone took photos or clips. Open one to go through it in order.
      </p>

      {days.length === 0 ? (
        <p className="muted" style={{ marginTop: 18 }}>
          Nothing yet. When a guide or a visiting teacher adds photos during the day, they collect
          here.
        </p>
      ) : (
        <div className="stack" style={{ gap: 10, marginTop: 16 }}>
          {days.map(([date, d]) => (
            <Link key={date} href={`/student/${linkHandle}/story/${date}`} className="card roster-card">
              <span className="roster-name">
                {weekdayShort(date)} · {date}
              </span>
              <span className="muted">
                {d.count} thing{d.count === 1 ? "" : "s"}
                {d.what.size ? ` · ${[...d.what].join(", ")}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}

      <p className="muted" style={{ marginTop: 20 }}>
        <Link href={`/student/${linkHandle}`}>← Back to my day</Link>
      </p>
    </main>
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
