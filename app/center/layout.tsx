import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CenterLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/switch");
  // Only center admins run this area; a neurable admin belongs in /admin.
  if (user.role !== "center_admin") redirect(homeForRole(user.role));

  const center = user.centerId
    ? await prisma.center.findUnique({ where: { id: user.centerId } })
    : null;

  return (
    <>
      <header className="topbar centerbar">
        <div className="wrap bar">
          <Link href="/" className="brand" style={{ color: "var(--accent-ink)" }}>
            <span className="mark parentmark" aria-hidden="true">
              <span></span>
            </span>
            Neurable
          </Link>
          <Link href="/switch" className="who-pill" style={{ color: "var(--accent-ink)" }} title="Switch account">
            {center?.name ?? "Center"} · {user.name} <span aria-hidden="true">⇄</span>
          </Link>
        </div>
      </header>
      <main className="page wrap" style={{ maxWidth: 1000 }}>
        {children}
      </main>
    </>
  );
}
