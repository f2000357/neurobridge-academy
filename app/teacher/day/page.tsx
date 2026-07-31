import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";
import { fmtMin, todayStr, weekdayShort, addDaysStr } from "@/lib/time";
import { noteAuthor } from "@/lib/noteAuthor";
import { withAuthor } from "@/lib/noteAuthor";
import DayMoments, { type DayBlock, type DayMoment } from "./DayMoments";

export const dynamic = "force-dynamic";

// Reviewing a day — and adding to it.
//
// The moments were only reachable from the progress report, which is a place
// you visit occasionally, not the thing you do on a Monday evening. This is the
// day itself: what was kept, and a way to keep more.
export default async function ReviewDayPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const kids = await rosterChildren(user);
  if (kids.length === 0) redirect("/teacher/admin");

  const sp = await searchParams;
  const child = kids.find((k) => k.id === sp.childId) ?? kids[0];
  const date = sp.date || todayStr();

  const [slots, notes] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: { childId: child.id, date },
      orderBy: { startMin: "asc" },
      include: { lessonPlan: { select: { title: true } } },
    }),
    prisma.teacherNote.findMany({
      where: { childId: child.id, date, media: { some: {} } },
      include: { ...withAuthor, media: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const blocks: DayBlock[] = slots.map((s) => ({
    id: s.id,
    when: fmtMin(s.startMin),
    label: s.lessonPlan?.title || s.activity || s.subject || s.kind,
  }));
  const moments: DayMoment[] = notes
    .flatMap((n) =>
      n.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        caption: m.caption,
        at: m.createdAt.getTime(),
        who: noteAuthor(n).name,
      }))
    )
    .sort((a, b) => a.at - b.at)
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      caption: m.caption,
      who: m.who,
      when: new Date(m.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    }));

  const handle = child.username ?? child.id;
  const go = (d: string) => `/teacher/day?childId=${child.id}&date=${d}`;

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Review the day</p>
      <h1 style={{ margin: "4px 0 2px" }}>{child.name.split(" ")[0]}&apos;s day</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        What was kept from {weekdayShort(date)} {date} — and anything you want to add.
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          {kids.length > 1 && (
            <label className="inline muted">
              Learner
              <select className="field short" defaultValue={child.id} name="childId" disabled>
                <option value={child.id}>{child.name}</option>
              </select>
            </label>
          )}
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <Link className="chip" href={go(addDaysStr(date, -1))}>
              ← Day before
            </Link>
            <Link className="chip" href={go(todayStr())}>
              Today
            </Link>
            <Link className="chip" href={go(addDaysStr(date, 1))}>
              Next day →
            </Link>
          </div>
        </div>
      </div>

      <DayMoments
        childId={child.id}
        childFirstName={child.name.split(" ")[0]}
        storyHref={`/student/${handle}/story/${date}`}
        date={date}
        blocks={blocks}
        moments={moments}
      />

      <p className="muted" style={{ marginTop: 16 }}>
        <Link href={`/student/${handle}/story`}>Every day with photos →</Link>
      </p>
    </main>
  );
}
