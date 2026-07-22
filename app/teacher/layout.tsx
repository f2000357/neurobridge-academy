import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SideNav from "./SideNav";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Guides live here; send admins to their own area.
  if (user && user.role !== "guide") redirect(homeForRole(user.role));

  // How many items are waiting on the guide's approval (badge on "Today").
  let approvals = 0;
  if (user) {
    const kids = await prisma.child.findMany({
      where: { teacherId: user.id, archived: false },
      select: { id: true },
    });
    const kidIds = kids.map((k) => k.id);
    if (kidIds.length) {
      const [lessons, weeks] = await Promise.all([
        prisma.proposedLesson.count({ where: { status: "pending", proposal: { childId: { in: kidIds } } } }),
        prisma.weeklyPlan.count({ where: { status: "proposed", childId: { in: kidIds } } }),
      ]);
      approvals = lessons + weeks;
    }
  }

  return (
    <>
      <header className="topbar parentbar">
        <div className="wrap bar">
          <Link href="/" className="brand" style={{ color: "var(--accent-ink)" }}>
            <span className="mark parentmark" aria-hidden="true">
              <span></span>
            </span>
            Neurable
          </Link>
          <Link
            href="/switch"
            className="who-pill"
            style={{ color: "var(--accent-ink)" }}
            title="Switch account"
          >
            Guide · {user?.name ?? ""} <span aria-hidden="true">⇄</span>
          </Link>
        </div>
      </header>

      <div className="console-shell">
        <SideNav approvals={approvals} />
        <div className="console-main">{children}</div>
      </div>
    </>
  );
}
