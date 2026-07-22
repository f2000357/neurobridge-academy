"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Center = { id: string; name: string };

async function post(payload: Record<string, unknown>) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export default function AdminOnboard({ centers }: { centers: Center[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Create center
  const [cName, setCName] = useState("");
  const [cRegion, setCRegion] = useState("");

  // Add staff
  const [sName, setSName] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sRole, setSRole] = useState("guide");
  const [sCenter, setSCenter] = useState(centers[0]?.id ?? "");

  async function createCenter() {
    if (!cName.trim() || busy) return;
    setBusy(true);
    const r = await post({ op: "createCenter", name: cName, region: cRegion });
    setBusy(false);
    if (r.error) return setNote(r.error);
    setCName("");
    setCRegion("");
    setNote(`Center “${cName}” created.`);
    router.refresh();
  }

  async function addStaff() {
    if (!sName.trim() || busy) return;
    setBusy(true);
    const r = await post({ op: "createUser", name: sName, email: sEmail, role: sRole, centerId: sCenter });
    setBusy(false);
    if (r.error) return setNote(r.error);
    setSName("");
    setSEmail("");
    setNote(`${sName} added as ${sRole === "center_admin" ? "center admin" : "guide"}.`);
    router.refresh();
  }

  return (
    <div className="onboard-grid">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>New center</h3>
        <div className="stack" style={{ gap: 8 }}>
          <input className="field" placeholder="Center name" value={cName} onChange={(e) => setCName(e.target.value)} />
          <input className="field" placeholder="Region (optional)" value={cRegion} onChange={(e) => setCRegion(e.target.value)} />
          <button className="btn" onClick={createCenter} disabled={busy || !cName.trim()}>
            Create center
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add staff</h3>
        <div className="stack" style={{ gap: 8 }}>
          <input className="field" placeholder="Full name" value={sName} onChange={(e) => setSName(e.target.value)} />
          <input className="field" placeholder="Email (optional)" value={sEmail} onChange={(e) => setSEmail(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <select className="field" value={sRole} onChange={(e) => setSRole(e.target.value)}>
              <option value="guide">Guide</option>
              <option value="center_admin">Center admin</option>
            </select>
            <select className="field" value={sCenter} onChange={(e) => setSCenter(e.target.value)}>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={addStaff} disabled={busy || !sName.trim() || !sCenter}>
            Add staff
          </button>
        </div>
      </div>

      {note && (
        <p className="muted" role="status" style={{ gridColumn: "1 / -1", margin: 0 }}>
          {note}
        </p>
      )}
    </div>
  );
}
