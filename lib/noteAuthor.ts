import { Prisma } from "@prisma/client";

// Who wrote a session note.
//
// A note is authored by a visiting specialist OR by a guide — the parent
// running most of their child's day needs to be able to record it too. Both are
// stored as their own relation, so every read has to resolve one of two shapes.
// Doing that in one place keeps the four read sites from drifting apart, and
// gives them a single answer for "what do we call this person".

/** Include this on any note query that needs to name the author. */
export const withAuthor = {
  teacher: { select: { id: true, name: true, specialty: true } },
  authorUser: { select: { id: true, name: true } },
} satisfies Prisma.TeacherNoteInclude;

type NoteWithAuthor = {
  teacherId: string | null;
  teacher: { id: string; name: string; specialty: string } | null;
  authorUserId: string | null;
  authorUser: { id: string; name: string } | null;
};

export type NoteAuthor = {
  id: string;
  name: string;
  /** The specialty to label the note with; guides have none of their own. */
  specialty: string;
  /** True when a guide wrote it rather than a visiting specialist. */
  isGuide: boolean;
};

export function noteAuthor(n: NoteWithAuthor): NoteAuthor {
  if (n.teacher) {
    return { id: n.teacher.id, name: n.teacher.name, specialty: n.teacher.specialty, isGuide: false };
  }
  if (n.authorUser) {
    return { id: n.authorUser.id, name: n.authorUser.name, specialty: "", isGuide: true };
  }
  // Neither set: the row predates this, or was written by someone since deleted.
  // Say so rather than inventing a name.
  return { id: "", name: "Someone", specialty: "", isGuide: false };
}
