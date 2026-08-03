// Slots store times as minutes-from-midnight on a local date string ("2026-07-21").

// The family's timezone — the one the whole app means by "today".
//
// This used to be whatever the machine ran in. On Vercel that is UTC, so from
// 8pm in New Jersey the server already believed it was tomorrow: a lesson done
// in the evening counted as past, a moment kept at bedtime was filed on the
// wrong day, and the week's Monday could roll a day early. The clock a family
// lives by is not a deployment detail, so it is named here rather than left to
// the host. Override with APP_TZ if a family is elsewhere.
export const APP_TZ = process.env.APP_TZ || process.env.NEXT_PUBLIC_APP_TZ || "America/New_York";

// "YYYY-MM-DD" from a Date's OWN fields. Date maths (addDaysStr, mondayOfStr)
// builds local-midnight Dates and needs them read back unchanged — running
// those through a timezone would shift them a day.
function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// en-CA formats as YYYY-MM-DD, which is exactly the shape slots are keyed by.
const isoInZone = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ });
const hmInZone = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Today where the family is. Passing a Date reads that Date's own fields. */
export function todayStr(d?: Date): string {
  return d ? isoOf(d) : isoInZone.format(new Date());
}

/** Minutes since midnight where the family is. */
export function nowMin(d?: Date): number {
  if (d) return d.getHours() * 60 + d.getMinutes();
  const parts = hmInZone.formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

// Plain "YYYY-MM-DD" date math, parsed as local dates (no timezone drift).
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysStr(dateStr: string, n: number): string {
  const d = parseLocal(dateStr);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

// Monday of the week containing dateStr (weeks start Monday).
export function mondayOfStr(dateStr: string): string {
  const d = parseLocal(dateStr);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDaysStr(dateStr, -dow);
}

/**
 * The week a guide is actually planning.
 *
 * Weeks run Monday–Sunday, so `mondayOfStr` maps Sunday back to a Monday six
 * days ago — the week that has just finished. But nobody opening the schedule on
 * a Sunday wants to look at the week that ended this morning; they are planning
 * the week ahead. So Sunday rolls forward to tomorrow.
 *
 * This is the DEFAULT view only — explicit navigation still reaches any week.
 */
export function planningWeekStart(fromStr = todayStr()): string {
  const d = parseLocal(fromStr);
  return d.getDay() === 0 ? addDaysStr(fromStr, 1) : mondayOfStr(fromStr);
}

/** Today, or the next weekday if today falls on a weekend. */
export function nextSchoolDay(fromStr = todayStr()): string {
  const dow = parseLocal(fromStr).getDay(); // 0 Sun … 6 Sat
  if (dow === 0) return addDaysStr(fromStr, 1); // Sunday -> Monday
  if (dow === 6) return addDaysStr(fromStr, 2); // Saturday -> Monday
  return fromStr;
}

// The upcoming Monday (strictly after today; if today is Monday, next week's).
export function nextMonday(fromStr = todayStr()): string {
  const d = parseLocal(fromStr);
  const dow = d.getDay(); // 0 Sun … 1 Mon … 6 Sat
  const daysUntil = ((8 - dow) % 7) || 7; // 1..7, never 0
  return addDaysStr(fromStr, daysUntil);
}

// Planning is capped at the current week + next week (2 weeks). Things change,
// so we don't let a guide build a schedule further out than that.
export function planningHorizonEnd(fromStr = todayStr()): string {
  return addDaysStr(planningWeekStart(fromStr), 13); // Sunday of the week after
}
export function withinPlanningHorizon(dateStr: string, fromStr = todayStr()): boolean {
  return dateStr <= planningHorizonEnd(fromStr);
}

export function weekdayShort(dateStr: string): string {
  const d = parseLocal(dateStr);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${names[d.getDay()]} ${d.getDate()}`;
}

// "09:30" (from <input type="time">) <-> minutes from midnight.
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function fmtMin(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "am" : "pm";
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
