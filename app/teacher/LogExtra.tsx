"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subjectLabel } from "@/lib/subjects";

type Child = { id: string; name: string };
type FlexSlot = { id: string; label: string };
type IndexSkill = { provider: string; standardCode: string; gradeLevel: string; skillName: string; practiceUrl: string };

const MASTERY = 90;
const SUBJECTS = ["math", "reading", "writing", "science"];
const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8"];
const coinsFor = (a: string) => {
  const n = Number(a);
  if (a === "" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.floor(n / 10)));
};

// The guide logs a skill the child did on their own (self-advanced). Pick the
// real skill from the index, enter the score (or abandoned), award coins. Below
// 90% can be repeated in a Flex block.
export default function LogExtra({
  childrenList,
  flexByChild = {},
}: {
  childrenList: Child[];
  flexByChild?: Record<string, FlexSlot[]>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [childId, setChildId] = useState(childrenList[0]?.id ?? "");
  const [subject, setSubject] = useState("math");
  const [grade, setGrade] = useState("3");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<IndexSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<IndexSkill | null>(null);
  const [acc, setAcc] = useState("");
  const [abandoned, setAbandoned] = useState(false);
  const [repeatSlot, setRepeatSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const post = (path: string, body: unknown) =>
    fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  async function search() {
    setLoading(true);
    const data = await post("/api/lessons", { op: "indexSkills", subject, grade, q });
    setResults(data.items ?? []);
    setLoading(false);
  }

  async function log() {
    if (!chosen) {
      setNote("Pick the skill they did.");
      return;
    }
    if (!abandoned && (acc === "" || !Number.isFinite(Number(acc)))) {
      setNote("Enter a score, or mark it abandoned.");
      return;
    }
    setBusy(true);
    setNote(null);
    const res = await post("/api/validate", {
      op: "logExtra",
      childId,
      title: chosen.skillName,
      provider: chosen.provider,
      practiceUrl: chosen.practiceUrl,
      ...(abandoned ? { abandoned: true } : { accuracy: Number(acc) }),
    });
    if (repeatSlot) {
      await post("/api/validate", {
        op: "scheduleRepeat",
        childId,
        slotId: repeatSlot,
        title: chosen.skillName,
        provider: chosen.provider,
        practiceUrl: chosen.practiceUrl,
      });
    }
    setBusy(false);
    setChosen(null);
    setAcc("");
    setAbandoned(false);
    setRepeatSlot("");
    setResults([]);
    setQ("");
    setNote(
      res.mastered
        ? `Logged — ${res.coins} ⭐, mastered${res.adjusted ? ` · removed ${res.adjusted} upcoming copy` : ""}.`
        : `Logged — ${res.coins} ⭐. Not mastered; ${repeatSlot ? "repeat scheduled." : "consider a repeat."}`
    );
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn quiet" onClick={() => setOpen(true)}>
        + Log extra work
      </button>
    );
  }

  const coins = abandoned ? 0 : coinsFor(acc);
  const accNum = Number(acc);
  const needsRepeat = abandoned || (acc !== "" && Number.isFinite(accNum) && accNum < MASTERY);
  const flex = flexByChild[childId] ?? [];

  return (
    <div className="card lift" style={{ borderColor: "var(--accent)" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <strong>Log extra work</strong>
        <button className="chip" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <label className="inline muted">
          Student
          <select className="field short" value={childId} onChange={(e) => setChildId(e.target.value)}>
            {childrenList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline muted">
          Subject
          <select className="field short" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {subjectLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline muted">
          Grade
          <select className="field short" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g === "K" ? "K" : `Grade ${g}`}
              </option>
            ))}
          </select>
        </label>
        <input
          className="field"
          style={{ flex: 1, minWidth: 160 }}
          placeholder="Search the skill they did (e.g. rounding)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <button className="chip" onClick={() => void search()} disabled={loading}>
          {loading ? "…" : "Find skill"}
        </button>
      </div>

      {results.length > 0 && !chosen && (
        <div className="stack" style={{ marginTop: 10, maxHeight: 200, overflowY: "auto", gap: 6 }}>
          {results.map((r, i) => (
            <div key={i} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: "0.85rem" }}>
                <span className="badge next">{"IXL"}</span> {r.skillName}{" "}
                <span className="muted">· {r.standardCode} · g{r.gradeLevel}</span>
              </span>
              <button className="chip" onClick={() => setChosen(r)}>
                Pick
              </button>
            </div>
          ))}
        </div>
      )}

      {chosen && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: "0.9rem" }}>
            <span className="badge next">{"IXL"}</span>{" "}
            <strong>{chosen.skillName}</strong>{" "}
            <button className="chip" style={{ marginLeft: 8 }} onClick={() => setChosen(null)}>
              change
            </button>
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label className="inline muted">
              Score %
              <input
                className="field tiny"
                inputMode="numeric"
                disabled={abandoned}
                value={acc}
                onChange={(e) => setAcc(e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
            </label>
            <button className={`chip ${abandoned ? "on" : ""}`} aria-pressed={abandoned} onClick={() => setAbandoned((v) => !v)}>
              Abandoned
            </button>
            {coins != null && <span className="v-coins">{coins} ⭐</span>}
            {acc !== "" && !abandoned && (
              <span className={`pill ${accNum >= MASTERY ? "good" : "warn"}`}>{accNum >= MASTERY ? "✓ mastered" : "↻ repeat"}</span>
            )}
            {needsRepeat && (
              <label className="inline muted" style={{ fontSize: "0.82rem" }}>
                Repeat in
                {flex.length > 0 ? (
                  <select className="field short" value={repeatSlot} onChange={(e) => setRepeatSlot(e.target.value)}>
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
            <button className="btn" onClick={log} disabled={busy}>
              {busy ? "Logging…" : "Log it"}
            </button>
          </div>
        </div>
      )}

      {note && (
        <p className="muted" role="status" style={{ marginTop: 10, fontSize: "0.85rem" }}>
          {note}
        </p>
      )}
    </div>
  );
}
