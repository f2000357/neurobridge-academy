"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddChild() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", name }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.id) router.push(`/teacher/admin/${data.id}`);
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <input
        className="field"
        style={{ maxWidth: 220 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Child's name"
        aria-label="New child's name"
      />
      <button className="btn" onClick={add} disabled={busy || !name.trim()}>
        + Add child
      </button>
    </div>
  );
}
