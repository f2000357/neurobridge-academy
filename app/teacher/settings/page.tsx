import { getCurrentUser } from "@/lib/auth";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await getCurrentUser({ select: { ixlUrl: true, name: true } });
  return (
    <main className="page wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Settings</p>
      <h1>Your linked tools</h1>
      <p className="muted">
        Link the practice tools you use, like IXL. It&apos;s just a reference to your own account —
        we don&apos;t store any password, and nothing syncs automatically.
      </p>
      <SettingsForm ixlUrl={me?.ixlUrl ?? ""} />
    </main>
  );
}
