import ChildSignIn from "./ChildSignIn";

export const dynamic = "force-dynamic";

// The child front door: sign in with a username + 8-digit code, then land on
// your own day. (The personalized link /student/<name> still works too.)
export default function StudentSignInPage() {
  return <ChildSignIn />;
}
