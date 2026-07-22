import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeForRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/switch");
  if (user.role !== "neurable_admin") redirect(homeForRole(user.role));

  return (
    <>
      <header className="topbar adminbar">
        <div className="wrap bar">
          <Link href="/" className="brand" style={{ color: "var(--accent-ink)" }}>
            <span className="mark parentmark" aria-hidden="true">
              <span></span>
            </span>
            Neurable
          </Link>
          <Link href="/switch" className="who-pill" style={{ color: "var(--accent-ink)" }} title="Switch account">
            Neurable Admin · {user.name} <span aria-hidden="true">⇄</span>
          </Link>
        </div>
      </header>
      <main className="page wrap" style={{ maxWidth: 1000 }}>
        {children}
      </main>
    </>
  );
}
