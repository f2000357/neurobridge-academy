"use client";

// The header account chip: who you are, plus sign out. In dev it also offers
// the quick-switch door for testing other roles.
export default function AccountMenu({ label, dev }: { label: string; dev?: boolean }) {
  async function signOut() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "logout" }),
    });
    window.location.href = "/login";
  }

  return (
    <span className="who-pill" style={{ color: "var(--accent-ink)", display: "inline-flex", gap: 10, alignItems: "center" }}>
      <span>{label}</span>
      <a href="/account" style={{ color: "inherit", opacity: 0.7 }} title="Your account">
        account
      </a>
      {dev && (
        <a href="/switch" style={{ color: "inherit", opacity: 0.7 }} title="Dev: switch account">
          switch
        </a>
      )}
      <button
        type="button"
        onClick={signOut}
        className="chip"
        style={{ borderColor: "currentColor" }}
      >
        Sign out
      </button>
    </span>
  );
}
