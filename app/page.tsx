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
            NeuroBridge Academy
          </div>
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 620 }}>
        <div className="parent-welcome">
          <p className="eyebrow">Personalized learning · Connected support · Meaningful progress</p>
          <h1>A learning path designed around your child.</h1>
          <p className="muted">
            AI-powered, standards-aligned education for neurodiverse learners — with families,
            educators, and specialists connected in one place.
          </p>
          <p className="muted">
            You know your child. We help you build the education they need.
          </p>

          {user ? (
            <>
              <Link href={homeForRole(user.role)} className="btn big" style={{ marginTop: 20 }}>
                Continue as {user.name} →
              </Link>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 14 }}>
                Signed in as {roleLabel(user.role)}
              </p>
            </>
          ) : (
            <>
              {/* Parents arrive here first now, so signing up leads and signing
                  in follows. Both stay visible — a returning parent shouldn't
                  have to hunt for the door they already have a key to. */}
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}
              >
                <Link href="/signup" className="btn big">
                  Start with your child
                </Link>
                <Link href="/login" className="btn big quiet">
                  Sign in
                </Link>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 14 }}>
                Free while we&apos;re building — no card, no commitment. Setting up takes a couple
                of minutes.
              </p>
            </>
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
