import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import AccountMenu from "@/app/components/AccountMenu";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "neurable_admin") redirect(homeForRole(user.role));

  return (
    <>
      <header className="topbar adminbar">
        <div className="wrap bar">
          <Link href="/" className="brand" style={{ color: "var(--accent-ink)" }}>
            <span className="mark parentmark" aria-hidden="true">
              <span></span>
            </span>
            NeuroBridge
          </Link>
          <Link href="/admin/specialists" className="who-pill" style={{ color: "var(--accent-ink)" }}>
            Visiting teachers
          </Link>
          <AccountMenu label={`NeuroBridge Admin · ${user.name}`} dev={process.env.NODE_ENV !== "production"} />
        </div>
      </header>
      <main className="page wrap" style={{ maxWidth: 1000 }}>
        {children}
      </main>
    </>
  );
}
