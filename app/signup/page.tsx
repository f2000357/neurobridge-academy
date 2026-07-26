import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="page wrap" style={{ maxWidth: 480 }}>
      <p className="eyebrow">NeuroBridge</p>
      <h1>Start with your child</h1>
      <p className="muted">
        A learning path designed around them. Set up your family in a minute — no centre, no
        invitation, and nothing to pay.
      </p>
      <SignupForm />
    </main>
  );
}
