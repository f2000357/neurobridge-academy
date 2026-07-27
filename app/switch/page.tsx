import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, homeForRole, roleLabel } from "@/lib/auth";
import { switchEnabled } from "@/lib/demo";

export const dynamic = "force-dynamic";

const ROLE_ORDER = ["neurable_admin", "center_admin", "guide"];

export default async function SwitchPage() {
  // Quick-login, local development only. On any production build this
  // redirects to /login — see lib/demo.ts.
  if (!switchEnabled) redirect("/login");
  const [specialists, users, currentId] = await Promise.all([
    prisma.specialistTeacher.findMany({
      where: { archived: false },
      include: { assignments: { include: { child: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ include: { center: true }, orderBy: { name: "asc" } }),
    getCurrentUserId(),
  ]);
  users.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  return (
    <main className="page wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">NeuroBridge</p>
      <h1>Who are you signing in as?</h1>
      <p className="muted">
        A stand-in for real sign-in while we build, available on local development only. Pick an
        account to see the app from their seat.
      </p>

      {specialists.length > 0 && (
        <>
          <p className="lbl" style={{ marginTop: 22 }}>Visiting specialists</p>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            What a therapist or teacher sees — their learners, and the notes they can write.
          </p>
          <div className="switch-list">
            {specialists.map((t) => (
              <a key={t.id} className="switch-row" href={`/api/switch?teacherId=${t.id}&to=/teach`}>
                <span className="switch-name">{t.name}</span>
                <span className="switch-role">
                  {t.assignments.length
                    ? t.assignments.map((a) => a.child.name).join(", ")
                    : "no learners assigned"}
                </span>
              </a>
            ))}
          </div>
          <p className="lbl" style={{ marginTop: 22 }}>Guides &amp; admins</p>
        </>
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
