import Link from "next/link";
import { planHealth } from "@/lib/planHealth";

// What the guide needs to know before the child does.
//
// Renders nothing when the plan is keeping up — a banner that is always there
// stops being read. It appears only when something needs a decision.

export default async function PlanBanner({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const h = await planHealth(childId);
  const first = childName.split(" ")[0] || childName;
  if (!h.nextWeekNeedsPlanning && h.notReached === 0) return null;

  return (
    <div className="plan-banner">
      {h.nextWeekNeedsPlanning && (
        <p className="plan-banner-line">
          <strong>Next week has no lessons yet.</strong> The blocks are there, but nothing is
          planned in them — {first} would open Monday to an empty day.{" "}
          <Link href={`/teacher/week-plan?childId=${childId}&weekStart=${h.nextWeekStart}`}>
            Plan next week →
          </Link>
        </p>
      )}

      {h.notReached > 0 && (
        <p className="plan-banner-line muted">
          {h.notReached} lesson{h.notReached === 1 ? "" : "s"} {first} never reached
          {h.carryable > 0 ? (
            <>
              {" "}
              — {h.carryable} recent enough to carry forward next time you regenerate. The rest stay
              as a record.
            </>
          ) : (
            <> — all older than a week, so they stay as a record rather than coming back.</>
          )}
        </p>
      )}
    </div>
  );
}
