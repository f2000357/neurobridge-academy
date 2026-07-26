# Multiple people managing one child — design

**Status:** design, decided 2026-07-25. Mostly not built — the one exception is the
therapist whole-day view (§1), which is live.

The scenario: a parent *and* a hired guide both manage a child; two ABA providers
cover a morning and an evening block; a substitute covers when one is away.

The guiding assumption, set by the product owner: **the people we let in are
responsible adults.** The AI plan is a *recommendation*; a guide overriding it is
normal, expected behaviour — not a conflict to be arbitrated. That assumption is
what keeps this design small.

---

## 1. What the code does today

**One owning guide.** `Child.teacherId` → a single `User`. `canOperateChild()`
(`lib/authz.ts`) returns true for that guide, *any* `center_admin` of the child's
centre, or a `neurable_admin`. It gates everything: schedule, lessons, points,
program, profile, IEP.

**Many specialists — already many-to-many.** `SpecialistTeacher` ↔
`TeacherAssignment` ↔ `Child`. They sign in at `/teach` with a `T`-code and write
session notes and attach photos/video. Deleting the assignment ends access; notes
remain, because they are the child's record.

**A field for block ownership exists, but nothing uses it.** `ScheduleSlot.teacherId`
can point at a `SpecialistTeacher`, but **0 of 212 slots have it set**: the "Taught
by" picker only appears for non-lesson blocks, and the day/week template never
sets it. So in practice **no therapist holds any block.**

**No forward schedule for a therapist — by design.** `/teach/[childId]` lists the
past three weeks up to today, never the future: a note is written after a session,
not before. See the decision below — this is deliberate, not a gap.

### What is actually missing

| Need | Today |
|---|---|
| Session notes, never visible to the child | ✅ works |
| A block recording which specialist held it | optional label only — not an access rule |
| Two providers covering different parts of the day | ✅ both see the whole day — no setup needed |
| **Parent *and* hired guide both fully managing** | ❌ one `teacherId` only |
| **A guide offboarding themselves** | ❌ no self-service |
| **Audit trail on edits** | ❌ `AuditLog` covers admin actions only |

### Decided: no therapist scheduling — show the whole day instead (built)

Therapist scheduling was considered and **rejected**. Rather than model which
blocks belong to which therapist, a therapist sees **the child's whole day**: what
maths they did, when they had a break, how the day ran around their own session.

This is better, not just cheaper:

- Two providers covering different parts of the day need **no setup at all** —
  neither owns blocks, both see the same context, both can write notes.
- A substitute needs nothing configured; they see the day like anyone else.
- It fixed a live bug. `/teach` filtered blocks to
  `teacherId = them OR activity = their subject`. With `teacherId` never set,
  the seeded specialist would have seen **0 of 54 blocks** for his assigned
  learner — an empty page. Removing the filter is the whole fix.

**Built 2026-07-25** (`app/teach/[childId]/page.tsx`): the block query is no longer
filtered by teacher or activity. Verified — the specialist signs in with their code
and sees all five days of the child's schedule; documents, IEP and points stay
withheld. `ScheduleSlot.teacherId` survives as an **optional label** ("Chess with
Ravi", and a "yours" badge in the whole-day list), never as an access rule.

Consequently dropped: recurring assignment rules, a forward-looking therapist
schedule, and date-range cover.

---

## 2. Concerns considered and closed

Recorded so they are not re-litigated later.

| Concern | Decision |
|---|---|
| **Plan authority** — two guides both regenerating/approving | **Not a problem.** Guides are expected to follow the AI plan *and* to override it when their own plan differs. An unapproved slot gets filled with something else; topics missed this way are picked up in a later week. |
| **Double-awarded coins** | **Not a problem** — the award is tied to a slot, so a block carries one award. If it is wrong, a guide **edits** it. |
| **Privacy tiering** (hide IEP from providers) | **Not wanted.** Anyone managing a child — including an evening provider — has the same access, IEP included. |
| **Observer / read-only role** | **Not wanted.** Do not build. |
| **Teacher-owned lesson library** | **Rejected as a concept.** A lesson is always tied to a *student*, because it is chosen from that student's own scores. Nothing about a lesson belongs to a teacher. A teacher may optionally publish one **globally**; that is the only sharing path. |
| **Ambiguous "waiting for your check" queue** | Not a concern. Shared queue; whoever gets there first settles it. |
| **Audit logging** | **Wanted — build it.** |

### Consequence: lessons are the child's, not the teacher's

`LessonPlan.teacherId` currently means "author" and drives a per-teacher library.
That framing should go:

- A lesson belongs to its **child** (`childId`).
- `teacherId` degrades to provenance ("who created this"), not ownership, and
  must not gate visibility between people managing the same child.
- `visibility: global` stays as the deliberate opt-in for sharing a lesson beyond
  one child.

---

## 3. Proposed schema

```prisma
// Who may act on a child. Replaces Child.teacherId as the authorization source;
// teacherId stays as a pointer to the primary guide (back-compat, and the answer
// to "who is ultimately responsible for this child").
model ChildAccess {
  id          String    @id @default(cuid())
  childId     String
  child       Child     @relation(fields: [childId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        String    // primary_guide | guide
  expiresAt   DateTime? // substitutes / temporary cover; null = open-ended
  invitedById String?
  createdAt   DateTime  @default(now())

  @@unique([childId, userId])
  @@index([userId])
}
```

Providers (ABA, OT, chess…) **stay on `SpecialistTeacher` / `TeacherAssignment`**.
They are not `User` accounts and should not become them: they sign in with a code
and see only their roster. Folding them in would mean provisioning full accounts
for every hired hand — more surface, no gain.

### Capability matrix

Two guide roles only. No privacy tiers between *guides*, no observer.

**Open question — does a T-code specialist see the IEP?** The decision was "an
evening provider managing a child has the same access to the IEP", which is clear
for someone holding a **guide account**. But the `/teach` specialist portal
(T-code, no user account) withholds documents, IEP and points today. Two ways to
settle it:

- **(a)** A provider who needs the IEP is given a **guide account** — the T-code
  portal stays narrow. Nothing to build.
- **(b)** Expose the IEP in `/teach` too — one query and one panel, but it puts a
  child's IEP behind a shared 8-character code rather than a password.

Leaning (a): the code-based portal is convenient precisely because it is low-stakes.

| | primary guide | guide | provider (specialist) |
|---|---|---|---|
| View schedule | ✅ edit | ✅ edit | ✅ whole day, read-only |
| Generate / approve / override lessons | ✅ | ✅ | — |
| **Award or edit points** | ✅ | ✅ | — |
| Session notes | ✅ | ✅ | ✅ |
| IEP docs, IEP review, MAP | ✅ | ✅ | ❌ today — see open question |
| Child profile, grade, subscriptions | ✅ | ✅ | — |
| Invite / remove **other** people | ✅ | — | — |
| Offboard **themselves** | — (must transfer first) | ✅ | ✅ |
| Archive / delete the child | ✅ | — | — |

---

## 4. Points: any guide, once per slot, editable

**Any guide may award points for any block** — it need not be a block they taught.
The award is tied to the slot, so a block carries **one** award; a guide who finds
it wrong **edits** it rather than adding a second.

Enforce with:

```prisma
model ProviderCompletion {
  // ...
  @@unique([childId, slotId])
}
```

Postgres treats `NULL`s as distinct, so this gives one row per scheduled block
while slot-less **extra work** stays unlimited. The row moves through states
instead of being duplicated:

```
awaiting → points_given (accuracy + coins)   ← editable
        └→ skipped      (not done)           ← editable
```

**Checked against the live database (2026-07-25):** 4 `ProviderCompletion` rows,
all `slotId: null`, **zero duplicate `(childId, slotId)` pairs** — the constraint
can be added as-is, no de-duplication needed. Re-check before applying if real
usage has happened since.

### Visibility

- **The child** sees per-block state on their day: *awaiting*, *⭐ n earned*, or
  *skipped*. Today they only see a running total plus "your guide will add your
  coins" — the per-block state needs surfacing.
- **The guide's queue** shows the same states (**Points · Skipped · …**) per block,
  so a second guide can see at a glance that a block is already settled.

---

## 5. Offboarding

### Who may remove whom

All four, with different scope:

| Who | May remove |
|---|---|
| **The person themselves** | only their own engagement |
| **Parent / primary guide** | anyone on their child — ultimate authority |
| **Center admin** | anyone on a child in their centre |
| **NeuroBridge admin** | anyone (support, last resort) |

**Hard rule — never leave a child unattended:**
- The **primary guide cannot self-offboard**; they must transfer primary to
  someone else first.
- Removing the **last remaining guide** is blocked.

Re-adding is easy and expected: the primary guide, another guide of the child, or
a centre admin can add someone back.

### The guide's Settings page is *theirs*

The child's settings live on the child's profile; the **guide's** Settings page is
about the guide. It should list **the children they handle**, and let them
**offboard themselves from any one of them** at any time. (This finally gives that
page a reason to exist.)

### What happens on removal — the operationally important part

1. **Access ends immediately.**
2. **Notes and media stay.** They are the child's record, not the departing
   person's. (`TeacherAssignment` already behaves this way.)
3. **Past sessions keep their attribution** — needed as IEP evidence.
4. **Upcoming blocks they held become unassigned** — `ScheduleSlot.teacherId → null`,
   so the block survives and reads as "the guide runs it". *(Only meaningful once
   therapist scheduling exists — today no block is assigned to anyone.)*
5. **The primary guide is told what now needs cover:** *"4 blocks next week were
   held by Ravi Kumar — they need cover."* Without this the week silently degrades.
   Same dependency: this is only possible once blocks record who holds them.
6. **An audit entry is written** (see below).

---

## 6. Audit logging (wanted)

`AuditLog` exists but only records admin actions (`transfer_learner`,
`promote_lesson`, …). Extend it to answer "who changed this" for a shared child:

- **Access:** invited / removed / self-offboarded / role changed / primary transferred
- **Points:** awarded / edited / skipped — with before → after
- **Schedule:** block added / moved / deleted; specialist assigned or cleared
- **Lessons:** week generated / approved / unapproved; lesson edited
- **Sensitive reads worth recording:** IEP review generated or exported

Each entry: actor, child, action, before → after, timestamp. Surface a
per-child **History** view — with several adults editing, this is what makes the
system explainable rather than mysterious.

---

## 7. Migration path

**Phase 1 — several guides**
1. Add `ChildAccess`; backfill one `primary_guide` row per child from
   `Child.teacherId`.
2. Rewrite `canOperateChild()` to read `ChildAccess` (keep `center_admin` /
   `neurable_admin` as they are).
3. "People" section on the child profile: list, invite by email, transfer primary,
   remove. Primary guide only.
4. Add `@@unique([childId, slotId])` to `ProviderCompletion`.

**Phase 2 — offboarding + audit**
5. Guide Settings: "children I handle" + self-offboard, with the last-guide and
   primary-guide guards.
6. On removal: unassign their upcoming blocks and tell the primary guide what
   needs cover.
7. Extend `AuditLog` per section 6, plus a per-child History view.

**Phase 3 — the tail**
8. Per-block point state on the child's day (awaiting / earned / skipped).
9. `expiresAt` honoured for substitutes, with a nightly sweep.
10. Decouple lessons from teacher ownership (section 2) — lessons are the child's;
    `global` stays the only sharing path.

---

## 8. Deliberately not building

- **Observer / read-only role.**
- **Privacy tiers** — everyone managing a child sees the same, IEP included.
- **Per-slot or time-window scoping of *guides*' permissions.** Guides see and do
  everything for their children. (Note this is different from *therapist
  scheduling* in section 1, which is a real gap worth building — that is about
  which blocks a therapist is expected to run, not about restricting access.)
- **Teacher-owned libraries.**
- **Approval workflows between guides.** Overriding the plan is normal, not a
  conflict to mediate.
