import { redirect } from "next/navigation";
import { currentOperator } from "@/lib/authz";
import FindHelp from "./FindHelp";

export const dynamic = "force-dynamic";

// Finding a therapist — the part of this families say is hardest.
//
// Signed-in guides only. A directory of people who work alone with disabled
// children, with their phone numbers, has no business on the open web.

export default async function FindPage() {
  const me = await currentOperator();
  if (!me) redirect("/login");

  return (
    <main className="page wrap">
      <p className="eyebrow">Find help</p>
      <h1>Therapists and teachers near you</h1>
      <p className="muted" style={{ maxWidth: "60ch" }}>
        Families on NeuroBridge who agreed to be findable. Nobody sees this but signed-in families,
        and a listing never shows who someone works with.
      </p>
      <FindHelp />
    </main>
  );
}
