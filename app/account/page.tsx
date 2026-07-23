import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, homeForRole, roleLabel } from "@/lib/auth";
import ChangePassword from "./ChangePassword";

export const dynamic = "force-dynamic";

// One account page for any operator (guide / centre admin / Neurable admin).
export default async function AccountPage() {
  const me = await getCurrentUser({ select: { name: true, email: true, role: true, passwordHash: true } });
  if (!me) redirect("/login");

  return (
    <main className="page wrap" style={{ maxWidth: 480 }}>
      <p className="eyebrow">Account</p>
      <h1>{me.name}</h1>
      <p className="muted">
        {roleLabel(me.role)}
        {me.email ? ` · ${me.email}` : ""}
      </p>

      <h2 style={{ marginTop: 26, fontSize: "1.15rem" }}>
        {me.passwordHash ? "Change your password" : "Set your password"}
      </h2>
      <ChangePassword hasPassword={Boolean(me.passwordHash)} />

      <p className="muted" style={{ marginTop: 20 }}>
        <Link href={homeForRole(me.role)}>← Back to your dashboard</Link>
      </p>
    </main>
  );
}
