import { prisma } from "./prisma";

// The audit trail. With several adults managing one learner, "who changed this"
// has to be answerable — otherwise the schedule quietly shifts under someone and
// nobody can explain it. Writes are best-effort: an audit failure must never break
// the action it was recording.

export const AUDIT = {
  // access
  accessGranted: "access_granted",
  accessRevoked: "access_revoked",
  accessSelfOffboard: "access_self_offboard",
  primaryTransferred: "primary_transferred",
  // points
  pointsAwarded: "points_awarded",
  pointsEdited: "points_edited",
  pointsSkipped: "points_skipped",
  // schedule
  blockAdded: "block_added",
  blockMoved: "block_moved",
  blockRemoved: "block_removed",
  dayGenerated: "day_generated",
  // lessons
  weekGenerated: "week_generated",
  weekApproved: "week_approved",
  lessonUnapproved: "lesson_unapproved",
  // profile — the parent's own description of their child
  profileUpdated: "profile_updated",
  // centres — asked for by the family, answered by the centre
  centerRequested: "center_requested",
  centerJoined: "center_joined",
  centerDeclined: "center_declined",
  centerLeft: "center_left",
  // sensitive
  iepReviewGenerated: "iep_review_generated",
  iepReviewsArchived: "iep_reviews_archived",
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

/** Human labels for the History view. */
export const AUDIT_LABEL: Record<string, string> = {
  access_granted: "Gave access",
  access_revoked: "Removed access",
  access_self_offboard: "Stepped away",
  primary_transferred: "Handed over as primary guide",
  points_awarded: "Awarded points",
  points_edited: "Changed points",
  points_skipped: "Marked not done",
  block_added: "Added a block",
  block_moved: "Moved a block",
  block_removed: "Removed a block",
  day_generated: "Filled in a day",
  week_generated: "Generated the week's lessons",
  week_approved: "Approved the week",
  lesson_unapproved: "Took a lesson off the schedule",
  profile_updated: "Updated the child's profile",
  center_requested: "Asked to join a centre",
  center_joined: "Joined a centre",
  center_declined: "Centre declined the request",
  center_left: "Left the centre",
  iep_review_generated: "Generated an IEP review",
  iep_reviews_archived: "Archived IEP reviews",
  // legacy admin actions
  transfer_learner: "Transferred learner",
  promote_lesson: "Promoted a lesson",
  create_user: "Created a user",
  create_center: "Created a centre",
};

export async function audit(entry: {
  actorId: string;
  actorName: string;
  action: AuditAction | string;
  childId?: string | null;
  detail?: string;
  before?: string;
  after?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        actorName: entry.actorName,
        action: entry.action,
        childId: entry.childId ?? null,
        detail: entry.detail ?? "",
        before: entry.before ?? "",
        after: entry.after ?? "",
      },
    });
  } catch {
    // Never let logging break the thing being logged.
  }
}

/** The child's own history, newest first. */
export async function historyForChild(childId: string, take = 50) {
  const rows = await prisma.auditLog.findMany({
    where: { childId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    action: r.action,
    label: AUDIT_LABEL[r.action] ?? r.action,
    detail: r.detail,
    before: r.before,
    after: r.after,
    at: r.createdAt.toISOString(),
  }));
}
