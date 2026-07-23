import { prisma } from "@/lib/prisma";
import { getCurrentUserId, homeForRole, roleLabel } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLE_ORDER = ["neurable_admin", "center_admin", "guide"];

export default async function SwitchPage() {
  const [users, currentId] = await Promise.all([
    prisma.user.findMany({ include: { center: true }, orderBy: { name: "asc" } }),
    getCurrentUserId(),
  ]);
  users.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  return (
    <main className="page wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Neurable</p>
      <h1>Who are you signing in as?</h1>
      <p className="muted">
        A stand-in for real sign-in while we build. Pick an account to see the app from their seat.
      </p>

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
