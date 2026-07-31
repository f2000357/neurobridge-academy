import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";

// The per-child sections that earn a place in the nav.
//
// IEP support, where a child stands, and their check-in results are recurring
// work — the IEP review is literally what a parent carries into a meeting. They
// used to live behind Children → a child → a chip called "Setup", which is a
// word that means configure-once, and so they read as settings.
//
// Rather than duplicate those screens, these routes resolve which child you
// mean and hand off to the page that already renders them.
export async function goToChildSection(tab: string, childId?: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const kids = await rosterChildren(user);
  if (kids.length === 0) redirect("/teacher/admin");
  const target = kids.find((k) => k.id === childId) ?? kids[0];
  redirect(`/teacher/admin/${target.id}?tab=${tab}`);
}
