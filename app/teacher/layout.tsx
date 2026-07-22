import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SideNav from "./SideNav";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const teacher = await prisma.user.findFirst({ select: { name: true } });

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
          <span style={{ fontSize: "0.9rem", color: "var(--accent-ink)", opacity: 0.9 }}>
            Guide portal · {teacher?.name ?? ""}
          </span>
        </div>
      </header>

      <div className="console-shell">
        <SideNav />
        <div className="console-main">{children}</div>
      </div>
    </>
  );
}
