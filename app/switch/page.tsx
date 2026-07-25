import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, homeForRole, roleLabel } from "@/lib/auth";
import { switchEnabled, demoSwitchOnHostedBuild } from "@/lib/demo";

export const dynamic = "force-dynamic";

const ROLE_ORDER = ["neurable_admin", "center_admin", "guide"];

export default async function SwitchPage() {
  // Quick-login for dev and for a hosted demo (DEMO_SWITCH=1). Otherwise /login.
  if (!switchEnabled) redirect("/login");
  const [users, currentId] = await Promise.all([
    prisma.user.findMany({ include: { center: true }, orderBy: { name: "asc" } }),
    getCurrentUserId(),
  ]);
  users.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  return (
    <main className="page wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">NeuroBridge</p>
      <h1>Who are you signing in as?</h1>
      <p className="muted">
        A stand-in for real sign-in while we build. Pick an account to see the app from their seat.
      </p>

      {demoSwitchOnHostedBuild && (
        <p
          className="muted"
          style={{ fontSize: "0.8rem", padding: "8px 10px", background: "var(--warm-soft)", borderRadius: 8 }}
        >
          <strong>Demo mode.</strong> Password-free sign-in is enabled on this hosted site
          (<code>DEMO_SWITCH=1</code>), so anyone with the link can enter any account. Use seeded demo
          data only — never a real child&apos;s records — and unset the variable when the demos are done.
        </p>
      )}

      <div className="switch-list">
        {users.map((u) => {
          const to = homeForRole(u.role);
          const here = u.id === currentId;
          return (
            <a
              key={u.id}
              className={`switch-row ${here ? "here" : ""}`}
              href={`/api/switch?userId=${u.id}&to=${encodeURIComponent(to)}`}
            >
              <span className="switch-avatar" aria-hidden="true">
                {u.name.charAt(0)}
              </span>
              <span className="switch-meta">
                <span className="switch-name">{u.name}</span>
                <span className="switch-sub">
                  {roleLabel(u.role)}
                  {u.center ? ` · ${u.center.name}` : " · all centers"}
                </span>
              </span>
              <span className="switch-go">{here ? "Current" : "Enter →"}</span>
            </a>
          );
        })}
      </div>
    </main>
  );
}
