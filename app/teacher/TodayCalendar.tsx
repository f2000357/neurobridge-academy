import { fmtMin } from "@/lib/time";
import { subjectLabel } from "@/lib/subjects";
import { activityFor } from "@/lib/activities";
import { slotColor } from "@/lib/slotColor";

type Slot = {
  id: string;
  childId: string;
  kind: string;
  startMin: number;
  endMin: number;
  activity: string;
  lessonPlan: { title: string; subject: string } | null;
  done: boolean;
};
type Kid = { id: string; name: string };

// One hue per child, used only for the column-header dot that identifies whose
// day it is. The blocks themselves are coloured by subject/kind (see slotColor).
const HUES = ["#4f9a7a", "#5f8fc2", "#c78a4c", "#9b7bb5", "#5aa0a0"];

const PX_PER_MIN = 0.85; // ~51px / hour — compact but fits two lines

function shortLabel(s: Slot): string {
  if (s.kind === "lesson") return subjectLabel(s.lessonPlan?.subject);
  const a = activityFor(s.activity);
  if (a) return `${a.emoji} ${a.label}`;
  if (s.kind === "service") return "Support session";
  if (s.kind === "one_on_one") return "1:1 with you";
  if (s.kind === "flexible") return "Flexible";
  if (s.kind === "break") return "Break";
  if (s.kind === "testing") return "Check-in";
  return "Free time";
}

export default function TodayCalendar({ kids, slots }: { kids: Kid[]; slots: Slot[] }) {
  if (slots.length === 0) return <p className="muted">Nothing scheduled today.</p>;

  const minStart = Math.min(...slots.map((s) => s.startMin));
  const maxEnd = Math.max(...slots.map((s) => s.endMin));
  const winStart = Math.floor(minStart / 60) * 60;
  const winEnd = Math.ceil(maxEnd / 60) * 60;
  const height = (winEnd - winStart) * PX_PER_MIN;

  const hours: number[] = [];
  for (let m = winStart; m <= winEnd; m += 60) hours.push(m);

  const hueFor = (childId: string) => HUES[kids.findIndex((k) => k.id === childId) % HUES.length];

  return (
    <div className="tcal" style={{ gridTemplateColumns: `48px repeat(${kids.length}, 1fr)` }}>
      <div className="tcal-corner" />
      {kids.map((k) => (
        <div key={k.id} className="tcal-colhead">
          <span className="tcal-dot" style={{ background: hueFor(k.id) }} />
          {k.name}
        </div>
      ))}

      <div className="tcal-times" style={{ height }}>
        {hours.map((m) => (
          <span key={m} className="tcal-time" style={{ top: (m - winStart) * PX_PER_MIN }}>
            {fmtMin(m)}
          </span>
        ))}
      </div>

      {kids.map((k) => {
        return (
          <div key={k.id} className="tcal-col" style={{ height }}>
            {hours.map((m) => (
              <div key={m} className="tcal-line" style={{ top: (m - winStart) * PX_PER_MIN }} />
            ))}
            {slots
              .filter((s) => s.childId === k.id)
              .map((s) => {
                const c = slotColor(s.kind, s.lessonPlan?.subject);
                return (
                <div
                  key={s.id}
                  className={`tcal-block ${s.done ? "done" : ""}`}
                  style={{
                    top: (s.startMin - winStart) * PX_PER_MIN,
                    height: Math.max(18, (s.endMin - s.startMin) * PX_PER_MIN - 2),
                    background: `color-mix(in srgb, ${c} 16%, var(--surface))`,
                    borderColor: `color-mix(in srgb, ${c} 55%, var(--border))`,
                    borderLeft: `3px solid ${c}`,
                  }}
                  title={`${fmtMin(s.startMin)}–${fmtMin(s.endMin)} · ${
                    s.kind === "lesson" ? s.lessonPlan?.title ?? "Lesson" : shortLabel(s)
                  }`}
                >
                  <span className="tcal-bt">{shortLabel(s)}</span>
                  <span className="tcal-bm">{fmtMin(s.startMin)}</span>
                </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
