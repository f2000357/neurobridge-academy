import { redirect } from "next/navigation";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Go where you belong.
  const me = await getCurrentUser({ select: { role: true } });
  if (me) redirect(homeForRole(me.role));
  return <LoginForm />;
}
