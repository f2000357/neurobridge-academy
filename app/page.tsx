import Link from "next/link";
import { getCurrentUser, homeForRole, roleLabel } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Front door. Staff sign in (dev switcher for now); learners use their own link.
export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="frontdoor">
      <header className="topbar">
        <div className="wrap bar">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            Neurable
          </div>
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 620 }}>
        <div className="parent-welcome">
          <p className="eyebrow">A calm, AI-powered school for neurodiverse learners</p>
          <h1>One platform — centers, guides, and learners.</h1>
          <p className="muted">
            The AI teaches each day&apos;s lessons, calmly and one step at a time. Guides plan and
            watch progress; center admins oversee their center; Neurable curates the shared library.
          </p>

          {user ? (
            <>
              <Link href={homeForRole(user.role)} className="btn big" style={{ marginTop: 20 }}>
                Continue as {user.name} →
              </Link>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 14 }}>
                Signed in as {roleLabel(user.role)} ·{" "}
                <Link href="/switch">switch account</Link>
              </p>
            </>
          ) : (
            <Link href="/switch" className="btn big" style={{ marginTop: 20 }}>
              Staff sign in →
            </Link>
          )}
        </div>
      </main>

      <footer className="fd-teacherbar">
        <div className="wrap">
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Learners sign in at their own link with their code.
          </span>
        </div>
      </footer>
    </div>
  );
}
