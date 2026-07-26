# Multiple people managing one child — design

**Status:** design only, not built. Decided 2026-07-25.

The scenario: a parent *and* a hired guide both manage a child; two ABA providers
cover a morning and an evening block; a substitute covers when one is away.

---

## 1. What the code does today

Two mechanisms already exist, and they are not the same thing.

**One owning guide.** `Child.teacherId` → a single `User`. `canOperateChild()`
(`lib/authz.ts`) returns true for that guide, *any* `center_admin` of the child's
centre, or a `neurable_admin`. It gates everything that edits the child: schedule,
lessons, points, program, profile, IEP.

**Many specialists — already many-to-many.** `SpecialistTeacher` ↔
`TeacherAssignment` ↔ `Child`. They sign in at `/teach` with a `T`-code and can
write session notes and attach photos/video. They cannot touch the schedule,
lessons or coins. Deleting the assignment ends access; notes remain, because they
are the child's record.

**Blocks can already be held by a specialist.** `ScheduleSlot.teacherId` points at
a `SpecialistTeacher`. So *morning ABA on the 9am block, evening ABA on the 4pm
block* works today with no schema change.

### What is actually missing

| Need | Today |
|---|---|
| Morning + evening ABA on their own blocks | ✅ works |
| Each writes session notes, never visible to the child | ✅ works |
| **Parent *and* hired guide both fully managing** | ❌ one `teacherId` only |
| **Substitute with time-limited access** | ❌ add, then remember to remove |
| **Read-only access** (case manager, grandparent) | ❌ all-or-nothing |

---

## 2. Problems to solve before allowing several managers

1. **Plan authority.** Two people who can both *Regenerate the week* will clobber
   each other — one approves a lesson, the other unapproves it.
2. **Double-awarded coins.** Two guides validating the same work pays the child
   twice. Today impossible because only one guide exists.
3. **Privacy.** Full operator access includes the **IEP, the IEP review and MAP
   scores**. An evening ABA provider should not see those. Right now the only way
   to grant scheduling power is to grant everything.
4. **Library ownership.** `LessonPlan.teacherId` is the author; with three
   managers, a child's lessons scatter across libraries.
5. **Ambiguous queues.** "Waiting for your check" — if everyone sees it, two
   people do the same work.
6. **No per-actor audit.** `AuditLog` records admin actions only, not schedule or
   lesson edits, so "who changed this" becomes unanswerable.
7. **Offboarding.** Access must end while the record stays. The specialist grant
   already does this correctly; a shared `teacherId` would not.

---

## 3. Proposed schema

```prisma
// Who may act on a child, and in what capacity. Replaces the single
// Child.teacherId as the authorization source; teacherId stays as a pointer to
// the primary guide (cheap back-compat, and the tie-break for plan decisions).
model ChildAccess {
  id        String   @id @default(cuid())
  childId   String
  child     Child    @relation(fields: [childId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      String   // primary_guide | co_guide | observer
  // Substitutes and temporary cover: access lapses on its own.
  expiresAt DateTime?
  invitedById String?
  createdAt DateTime @default(now())

  @@unique([childId, userId])
  @@index([userId])
}
```

Providers (ABA, OT, chess…) **stay on `SpecialistTeacher` / `TeacherAssignment`**.
They are not `User` accounts and should not become them: they sign in with a code,
see only their roster, and write notes. Folding them into `ChildAccess` would
force provisioning real accounts for every hired hand — more surface, no gain.

### Capability matrix

Deliberately coarse. Per-slot scoping was considered and **rejected for now** as
more complexity than the problem warrants.

| | primary guide | co-guide | observer | provider (specialist) |
|---|---|---|---|---|
| View schedule & lessons | ✅ | ✅ | ✅ | own blocks |
| Edit schedule, add/move blocks | ✅ | ✅ | — | — |
| Generate / approve weekly lessons | ✅ | ✅ | — | — |
| **Award points** | ✅ | ✅ | — | — |
| Write session notes | ✅ | ✅ | — | ✅ |
| IEP docs, IEP review, MAP scores | ✅ | ✅ | — | **—** |
| Child profile, grade, subscriptions | ✅ | ✅ | — | — |
| Invite/remove people, change primary | ✅ | — | — | — |
| Archive/delete the child | ✅ | — | — | — |

Exactly one `primary_guide` per child. Only they manage access and destructive
actions — that resolves problem 1 without making co-guides second-class for
day-to-day work.

---

## 4. Points: any guide, **once per block**

Decided: **any guide may award points for any block** — it does not have to be a
block they taught. Scoping points to your own slots was rejected as unnecessary
friction. The safety property is not *who* awards, it is *how often*:

> **A block yields points exactly once.**

### How to enforce it

`ProviderCompletion` currently has no uniqueness on `(childId, slotId)`, so two
guides can each create an award for the same block. Add:

```prisma
model ProviderCompletion {
  // ...
  @@unique([childId, slotId])
}
```

This works cleanly because Postgres treats `NULL`s as distinct: one row per
scheduled block, while **extra work** (logged with `slotId: null`) stays unlimited.
A block's row then moves through states rather than being duplicated:

```
awaiting → points_given (accuracy + coins)
        └→ skipped      (not done / abandoned — no coins)
```

**Checked against the live database (2026-07-25):** 4 `ProviderCompletion` rows,
all with `slotId: null` (logged extra work), **zero duplicate `(childId, slotId)`
pairs** — so the constraint can be added as-is, with no de-duplication step.
Re-check before applying if real usage has happened since.

### What the child sees

Points must be visible to the child, per block: their day shows the block as
**awaiting**, **⭐ n earned**, or **skipped**. Today the child only sees a total
and "your guide will add your coins" — the per-block state needs surfacing.

### What the guide sees

The guide's queue is per child and per block, showing **Points · Skipped · …**
state directly, so a second guide can see at a glance that a block is already
settled and does not re-award it. The queue is shared, not per-guide: whoever
gets there first settles it, and the state makes that obvious.

---

## 5. Conflict rules

- **Weekly plan** — regenerate replaces only *upcoming* lessons (already true).
  Add "last regenerated by X at T" so a second guide sees it just changed.
- **Approve / unapprove** — allowed by any guide; already blocked for past days.
- **Points** — the `@@unique([childId, slotId])` constraint is the guard. A
  second attempt updates the existing row rather than creating a new award.
- **Simultaneous schedule edits** — the overlap check already rejects clashes;
  last write wins on a move, which is acceptable for a two-person household.

---

## 6. Migration path

**Phase 1 — co-guides (smallest useful step)**
1. Add `ChildAccess`; backfill one `primary_guide` row per child from
   `Child.teacherId`.
2. Rewrite `canOperateChild()` as `can(childId, capability)`, reading
   `ChildAccess` (keep `center_admin` / `neurable_admin` as they are).
3. "People" section on the child profile: list, invite by email, change role,
   remove. Only the primary guide sees it.
4. Add `@@unique([childId, slotId])` to `ProviderCompletion` after de-duping.

**Phase 2 — visibility**
5. Per-block point state on the child's day and in the guide queue
   (awaiting / earned / skipped).
6. Record the acting user on schedule, lesson and point mutations (extend
   `AuditLog`), so "who changed this" is answerable.

**Phase 3 — the long tail**
7. `expiresAt` honoured for substitutes, with a nightly sweep.
8. `observer` (read-only reports).
9. Hide IEP/MAP from anyone below guide — matters as soon as non-family
   co-guides exist.

---

## 7. Deliberately deferred

- **Per-slot / time-window scoping of guides** ("morning guide" vs "evening
  guide"). `ScheduleSlot.teacherId` already covers the provider case; scoping
  *guides* by time adds real complexity for little benefit today.
- **Turning specialists into `User` accounts.**
- **Approval workflows between co-guides** (one proposes, the other confirms).
  Only worth it if two managers actually start conflicting in practice.
