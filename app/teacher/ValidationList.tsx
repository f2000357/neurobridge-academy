"use client";

import { providerName } from "@/lib/providers";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type CheckItem = {
  id: string;
  childId: string;
  childName: string;
  title: string;
  provider: string;
  practiceUrl: string;
};
export type FlexSlot = { id: string; label: string };

const providerLabel = providerName;
const MASTERY = 90;
const coinsFor = (acc: string) => {
  const n = Number(acc);
  if (!Number.isFinite(n) || acc === "") return null;
  return Math.max(0, Math.min(10, Math.floor(n / 10)));
};

// The guide opens the child's work, enters the score (or marks it abandoned).
// Coins = floor(accuracy/10). Below 90% (or abandoned) the skill isn't mastered
// and can be repeated in a chosen Flex block.
export default function ValidationList({
  items,
  flexByChild = {},
}: {
  items: CheckItem[];
  flexByChild?: Record<string, FlexSlot[]>;
}) {
  const router = useRouter();
  const [acc, setAcc] = useState<Record<string, string>>({});
  const [abandoned, setAbandoned] = useState<Record<string, boolean>>({});
  const [repeatSlot, setRepeatSlot] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // What the camera read, per row — shown for confirmation, never applied blind.
  const [reading, setReading] = useState<string | null>(null);
  const [readOut, setReadOut] = useState<Record<string, string>>({});
  const shotRef = useRef<HTMLInputElement>(null);
  const [shotFor, setShotFor] = useState<CheckItem | null>(null);

  // A photo of the child's own IXL detail view. The guide is not on the family's
  // IXL account and never should be, but they are sitting next to the screen —
  // so they photograph what is already in front of them rather than typing a
  // number they cannot see. Questions answered vs correct is a real percentage;
  // SmartScore is not, and is deliberately ignored.
  async function readFromShot(file: File, it: CheckItem) {
    setReading(it.id);
    setReadOut((m) => ({ ...m, [it.id]: "" }));
    const buf = await file.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const d = await post({
      op: "readScore",
      childId: it.childId,
      mimeType: file.type || "image/jpeg",
      imageBase64: btoa(bin),
    });
    setReading(null);
    if (!d?.ok || !d.read) {
      setReadOut((m) => ({ ...m, [it.id]: d?.reason ?? d?.error ?? "Couldn't read that." }));
      return;
    }
    // Fill the box, don't submit. An adult still says yes.
    setAcc((a) => ({ ...a, [it.id]: String(d.accuracy) }));
    setReadOut((m) => ({
      ...m,
      [it.id]: `Read ${d.correct}/${d.answered} correct → ${d.accuracy}%${d.skill ? ` · ${d.skill}` : ""}. Check it, then confirm.`,
    }));
  }

  const post = (body: unknown) =>
    fetch("/api/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  async function confirm(it: CheckItem) {
    setBusy(it.id);
    const ab = abandoned[it.id];
    await post(ab ? { op: "confirm", id: it.id, abandoned: true } : { op: "confirm", id: it.id, accuracy: Number(acc[it.id]) });
    const slotId = repeatSlot[it.id];
    if (slotId) {
      await post({ op: "scheduleRepeat", childId: it.childId, slotId, title: it.title, provider: it.provider, practiceUrl: it.practiceUrl });
    }
    setBusy(null);
    router.refresh();
  }

  async function reject(id: string) {
    setBusy(id);
    await post({ op: "reject", id });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map((it) => {
        const ab = abandoned[it.id] ?? false;
        const coins = ab ? 0 : coinsFor(acc[it.id] ?? "");
        const accNum = Number(acc[it.id]);
        const hasScore = !ab && (acc[it.id] ?? "") !== "" && Number.isFinite(accNum);
        const mastered = hasScore && accNum >= MASTERY;
        const needsRepeat = ab || (hasScore && accNum < MASTERY);
        const canConfirm = ab || hasScore;
        const flex = flexByChild[it.childId] ?? [];
        return (
          <div key={it.id} className="validate-row" style={{ flexWrap: "wrap" }}>
            <span className="v-main">
              <span className="v-name">{it.childName}</span>
              <span className="muted"> · {it.title} · {providerLabel(it.provider)}</span>
            </span>
            {it.practiceUrl && (
              <a className="chip" href={it.practiceUrl} target="_blank" rel="noreferrer">
                Open the work →
              </a>
            )}
            <input
              className="field v-acc"
              inputMode="numeric"
              placeholder="score %"
              aria-label={`Score for ${it.childName}`}
              disabled={ab}
              value={acc[it.id] ?? ""}
              onChange={(e) => setAcc((a) => ({ ...a, [it.id]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
            />
            <button
              className="chip"
              disabled={ab || reading === it.id}
              onClick={() => {
                setShotFor(it);
                shotRef.current?.click();
              }}
              title="Photograph the skill's detail view on his screen"
            >
              {reading === it.id ? "Reading…" : "📷 Read the score"}
            </button>
            <button
              className={`chip ${ab ? "on" : ""}`}
              aria-pressed={ab}
              onClick={() => setAbandoned((m) => ({ ...m, [it.id]: !m[it.id] }))}
            >
              Abandoned
            </button>
            <span className="v-coins">{coins == null ? "" : `${coins} ⭐`}</span>
            {hasScore && (
              <span className={`pill ${mastered ? "good" : "warn"}`}>{mastered ? "✓ mastered" : "↻ repeat"}</span>
            )}
            {needsRepeat && (
              <label className="inline muted" style={{ fontSize: "0.82rem" }}>
                Repeat in
                {flex.length > 0 ? (
                  <select
                    className="field short"
                    value={repeatSlot[it.id] ?? ""}
                    onChange={(e) => setRepeatSlot((m) => ({ ...m, [it.id]: e.target.value }))}
                  >
                    <option value="">— skip —</option>
                    {flex.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted"> no free Flex block</span>
                )}
              </label>
            )}
            <button
              className="chip approve"
              disabled={busy === it.id || !canConfirm}
              onClick={() => confirm(it)}
            >
              ✓ Confirm
            </button>
            <button className="chip danger" disabled={busy === it.id} onClick={() => reject(it.id)}>
              Not done
            </button>
            {readOut[it.id] && (
              <p className="muted" style={{ width: "100%", margin: "4px 0 0", fontSize: "0.82rem" }}>
                {readOut[it.id]}
              </p>
            )}
          </div>
        );
      })}

      {/* One picker for every row; `shotFor` says which row asked. */}
      <input
        ref={shotRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && shotFor) void readFromShot(f, shotFor);
          e.target.value = "";
        }}
      />
    </div>
  );
}
