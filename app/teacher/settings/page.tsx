import { getCurrentUser } from "@/lib/auth";
import { childrenForUser } from "@/lib/access";
import SettingsForm from "./SettingsForm";
import MyLearners, { type MyLearner } from "./MyLearners";

export const dynamic = "force-dynamic";

// This page is about YOU, not about a learner — the child's own settings live on
// their profile. Your linked tools, and the learners you handle (with the door out).
export default async function SettingsPage() {
  const me = await getCurrentUser({ select: { id: true, ixlUrl: true, name: true } });
  const learners: MyLearner[] = me ? await childrenForUser(me.id) : [];

  return (
    <main className="page wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Settings</p>
      <h1>Your settings</h1>

      <h2 style={{ marginTop: 20 }}>Your linked tools</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Link the practice tools you use, like IXL. It&apos;s just a reference to your own account —
        we don&apos;t store any password, and nothing syncs automatically.
      </p>
      <SettingsForm ixlUrl={me?.ixlUrl ?? ""} />

      <MyLearners learners={learners} />
    </main>
  );
}
