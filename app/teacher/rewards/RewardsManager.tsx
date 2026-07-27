"use client";

import { useEffect, useRef, useState } from "react";

// A calm, curated set of prize-friendly icons to pick from.
const ICON_CHOICES = [
  "🎁", "🎉", "⭐", "🏆", "🥇", "🎖️",
  "🎮", "🕹️", "📱", "🎧", "🎬", "📺",
  "🍦", "🍩", "🍪", "🍫", "🍭", "🧁",
  "🍕", "🍿", "🥤", "🍔", "🌮", "🍬",
  "🎨", "🖍️", "✏️", "📚", "🧩", "🧸",
  "🚗", "🚀", "🪀", "🎈", "🎟️", "🎫",
  "⚽", "🏀", "🎾", "🛹", "🚲", "🎯",
  "🎲", "🎸", "🥁", "🐶", "🐱", "🦖",
  "💎", "🪙", "🛍️", "🧦", "👕", "🧢",
  "⌚", "🔮", "🌟", "🌈", "🏅", "💫",
];

type Reward = { id: string; name: string; cost: number; emoji: string; active: boolean
  childId: string | null;
};
type Kid = { id: string; name: string; balance: number };
type Recent = {
  id: string;
  childName: string;
  rewardName: string;
  emoji: string;
  cost: number;
  when: string;
};

async function api(payload: Record<string, unknown>) {
  try {
    const res = await fetch("/api/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { error: "network" };
  }
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function RewardsManager({
  childrenList,
  rewards: initialRewards,
  recent: initialRecent,
}: {
  childrenList: Kid[];
  rewards: Reward[];
  recent: Recent[];
}) {
  const [kids, setKids] = useState<Kid[]>(childrenList);
  const [rewards, setRewards] = useState<Reward[]>(initialRewards);
  const [recent, setRecent] = useState<Recent[]>(initialRecent);
  const [selId, setSelId] = useState<string>(childrenList[0]?.id ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-prize form
  const [emoji, setEmoji] = useState("🎁");
  const [name, setName] = useState("");
  const [cost, setCost] = useState(50);

  const selected = kids.find((k) => k.id === selId);

  async function redeem(r: Reward) {
    if (!selected || busy) return;
    if (r.cost > selected.balance) return;
    setBusy(true);
    setNote(null);
    const res = await api({ op: "redeem", childId: selected.id, rewardId: r.id });
    setBusy(false);
    if (res.error) {
      setNote(res.error);
      return;
    }
    setKids((prev) => prev.map((k) => (k.id === selected.id ? { ...k, balance: res.balance } : k)));
    setRecent((prev) => [
      {
        id: res.redemption.id,
        childName: selected.name,
        rewardName: r.name,
        emoji: r.emoji,
        cost: r.cost,
        when: new Date().toISOString(),
      },
      ...prev,
    ]);
    setNote(`🎉 ${selected.name} redeemed ${r.emoji} ${r.name}. Hand it over and celebrate!`);
  }

  async function addReward() {
    if (!name.trim() || cost <= 0 || busy) return;
    setBusy(true);
    setNote(null);
    const res = await api({ op: "addReward", childId: selId, name, cost, emoji });
    setBusy(false);
    if (res.error) {
      setNote(res.error);
      return;
    }
    setRewards((prev) => [...prev, { id: res.reward.id, name: res.reward.name, cost: res.reward.cost, emoji: res.reward.emoji, active: true, childId: selId }]);
    setName("");
    setCost(50);
    setEmoji("🎁");
  }

  async function toggleActive(r: Reward) {
    setRewards((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    await api({ op: "updateReward", id: r.id, active: !r.active });
  }

  async function removeReward(r: Reward) {
    setRewards((prev) => prev.filter((x) => x.id !== r.id));
    await api({ op: "removeReward", id: r.id });
  }

  async function undo(rec: Recent) {
    setBusy(true);
    const res = await api({ op: "undoRedeem", id: rec.id });
    setBusy(false);
    if (res.error) {
      setNote(res.error);
      return;
    }
    setRecent((prev) => prev.filter((x) => x.id !== rec.id));
    // give the points back in the local balance if that child is loaded
    setKids((prev) =>
      prev.map((k) => (k.name === rec.childName ? { ...k, balance: k.balance + rec.cost } : k))
    );
    setNote(`Reversed ${rec.childName}'s ${rec.rewardName} — points returned.`);
  }

  return (
    <main className="page wrap" style={{ maxWidth: 900 }}>
      <p className="eyebrow">Prizes</p>
      <h1>Reward store</h1>
      <p className="muted" style={{ maxWidth: "60ch" }}>
        Set up prizes for school or home, then help a child cash in the points they&apos;ve earned.
        Points spent come out of their balance; the lifetime total they&apos;re proud of stays put.
      </p>

      {note && (
        <div className="action-banner" role="status" style={{ marginTop: 16 }}>
          {note}
        </div>
      )}

      {/* ---- Redeem for a child ---- */}
      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Redeem for a child</h2>
        <div className="kid-chips">
          {kids.map((k) => (
            <button
              key={k.id}
              className={`kid-chip ${k.id === selId ? "on" : ""}`}
              onClick={() => setSelId(k.id)}
            >
              <span className="kid-chip-name">{k.name}</span>
              <span className="kid-chip-bal">⭐ {k.balance}</span>
            </button>
          ))}
        </div>

        {selected && (
          <>
            <p className="muted" style={{ marginTop: 14, marginBottom: 8 }}>
              {selected.name} has <strong>⭐ {selected.balance}</strong> to spend.
            </p>
            {rewards.filter((r) => r.active).length === 0 ? (
              <p className="muted">No prizes yet — add some below.</p>
            ) : (
              <div className="prize-grid">
                {rewards
                  .filter((r) => r.active)
                  .map((r) => {
                    const afford = selected.balance >= r.cost;
                    return (
                      <div key={r.id} className={`prize-card ${afford ? "" : "locked"}`}>
                        <span className="prize-emoji" aria-hidden="true">
                          {r.emoji}
                        </span>
                        <span className="prize-name">{r.name}</span>
                        <span className="prize-cost">⭐ {r.cost}</span>
                        <button
                          className="btn"
                          disabled={!afford || busy}
                          onClick={() => redeem(r)}
                        >
                          {afford ? "Redeem" : `Needs ${r.cost - selected.balance} more`}
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </section>

      {/* ---- Manage the prize shelf ---- */}
      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>The prize shelf</h2>
        <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
          <div className="inline muted">
            Icon
            <IconPicker value={emoji} onChange={setEmoji} />
          </div>
          <label className="inline muted" style={{ flex: 1 }}>
            Prize
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Extra screen time, pick dinner, small toy…"
              onKeyDown={(e) => e.key === "Enter" && addReward()}
            />
          </label>
          <label className="inline muted">
            Points
            <input
              className="field short"
              type="number"
              min={1}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </label>
          <button className="btn" onClick={addReward} disabled={busy || !name.trim()}>
            Add prize
          </button>
        </div>

        {rewards.length > 0 && (
          <ul className="shelf-list">
            {rewards
              // A prize belongs to one child. Legacy rows with no child yet are
              // shown to everyone until someone assigns them.
              .filter((r) => r.childId === null || r.childId === selId)
              .map((r) => (
              <li key={r.id} className={`shelf-item ${r.active ? "" : "off"}`}>
                <span className="prize-emoji sm" aria-hidden="true">
                  {r.emoji}
                </span>
                <span className="shelf-name">{r.name}</span>
                <span className="prize-cost">⭐ {r.cost}</span>
                <button className="chip" onClick={() => toggleActive(r)}>
                  {r.active ? "Hide" : "Show"}
                </button>
                <button className="chip danger" onClick={() => removeReward(r)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Recent redemptions ---- */}
      {recent.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Recently redeemed</h2>
          <ul className="shelf-list">
            {recent.map((rec) => (
              <li key={rec.id} className="shelf-item">
                <span className="prize-emoji sm" aria-hidden="true">
                  {rec.emoji}
                </span>
                <span className="shelf-name">
                  {rec.childName} · {rec.rewardName}
                </span>
                <span className="muted" style={{ fontSize: "0.82rem" }}>
                  {whenLabel(rec.when)}
                </span>
                <span className="prize-cost">−⭐ {rec.cost}</span>
                <button className="chip" onClick={() => undo(rec)} disabled={busy}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// Click the current icon to open a small palette — no typing needed.
function IconPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="icon-picker" ref={ref}>
      <button
        type="button"
        className="icon-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Choose an icon"
        title="Choose an icon"
      >
        <span aria-hidden="true">{value}</span>
        <span className="icon-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="icon-pop" role="listbox" aria-label="Icons">
          {ICON_CHOICES.map((ic) => (
            <button
              type="button"
              key={ic}
              className={`icon-opt ${ic === value ? "on" : ""}`}
              onClick={() => {
                onChange(ic);
                setOpen(false);
              }}
              role="option"
              aria-selected={ic === value}
            >
              {ic}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
