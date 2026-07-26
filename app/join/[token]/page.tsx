import Link from "next/link";
import { prisma } from "@/lib/prisma";
import JoinForm from "./JoinForm";

export const dynamic = "force-dynamic";

// A guide accepting a parent's invitation. They set their own password and land
// on the child — no admin, no centre, no waiting.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.guideInvitation.findUnique({
    where: { token },
    include: { child: { select: { name: true } } },
  });

  const dead =
    !invite ||
    invite.revokedAt !== null ||
    invite.acceptedAt !== null ||
    invite.expiresAt.getTime() < Date.now();

  if (dead) {
    return (
      <main className="page wrap" style={{ maxWidth: 480 }}>
        <p className="eyebrow">NeuroBridge</p>
        <h1>This invitation isn&apos;t valid</h1>
        <p className="muted">
          {invite?.acceptedAt
            ? "It has already been used — try signing in."
            : "It may have expired or been withdrawn. Ask whoever invited you to send a new one."}
        </p>
        <Link className="btn" href="/login">
          Go to sign in
        </Link>
      </main>
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });

  return (
    <main className="page wrap" style={{ maxWidth: 480 }}>
      <p className="eyebrow">NeuroBridge</p>
      <h1>Help guide {invite.child.name}</h1>
      <p className="muted">
        {invite.invitedByName || "A parent"} has asked you to help manage {invite.child.name}&apos;s
        learning. {existing ? "Sign in to accept." : "Set a password and you're in."}
      </p>
      <JoinForm token={token} email={invite.email} name={invite.name} hasAccount={Boolean(existing)} />
    </main>
  );
}
