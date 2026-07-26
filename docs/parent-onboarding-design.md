# Parent onboarding, centres, and centre events — design

**Status:** design only, nothing built. Decided 2026-07-25.

The product is **parent-driven**. A parent signs up, adds their child, and is in
business on their own. A centre is something they may *choose* to join later — not
a prerequisite, not an owner. Everything else follows from that.

---

## 1. The shape of it

```
Parent signs up  →  adds a child  →  works alone
                                 ↘  or asks to join a centre
                                        ↓
                          centre admin approves + payment set up
                                        ↓
                          centre can push events to the child's calendar
                                        ↓
                          guide/parent accepts and reshuffles the day
```

Two ideas carry the whole design:

1. **The parent is the root of authority for their child.** They hold the
   subscription, they invite guides, and only they can ask to join a centre.
2. **A guide is tied to a child, not to a centre.** Hired help follows the family,
   not the institution.

---

## 2. Roles, restated

| Role | How they get in | What they are |
|---|---|---|
| **Parent / guardian** | Self-serve signup | Owns the subscription; `primary_guide` on their child. Invites guides, initiates centre membership, ultimate authority. |
| **Guide** | Invited by the parent (email workflow) | Full day-to-day management of that child. Not attached to any centre. |
| **Specialist** (ABA, OT, chess) | Added by a parent or guide; signs in with a T-code | Authority stops at the activity they govern. Never a NeuroBridge account. |
| **Centre admin** | Created by NeuroBridge admin | Runs a centre: approves join requests, runs events, manages centre staff. |
| **NeuroBridge admin** | Seeded | Creates centres and centre staff. Support and last resort. |

`ChildAccess` (see `multi-manager-design.md`) already models parent-vs-guide as
`primary_guide` vs `guide`. **The parent is simply the primary guide.** No new role
is needed — but the *route in* changes completely.

---

## 3. Signup and subscription

Today every account is created by an admin. That has to invert: a parent must be
able to sign up unaided.

**The flow:** email + password → verify email → name → add a child (name, age,
grade, interests) → choose *"just us"* or *"find a centre"* → done, land on the
console with a child ready to schedule.

**Subscription is real from day one, priced at zero.** A `Subscription` record
exists with `plan: "free"` and `amount: 0`, and the signup flow shows a plan step —
so introducing a price later is a pricing change, not a re-architecture. No card is
collected while it is free.

**Purchases are transferable.** The subscription belongs to the *parent*, and the
child's record belongs to the *child*. Moving between homeschool and a centre, or
between centres, never re-buys anything and never migrates data.

---

## 4. Joining a centre

**Only the parent may initiate.** A centre cannot add a child; it can only accept
one. This is the safeguard that keeps the parent in charge.

1. Parent browses centres (name, region, what they offer) and requests to join.
2. The **centre admin is notified** and sees the child: name, age, grade, and what
   the parent chose to share. They approve or decline, with a reason.
3. On approval, **payment is set up** — the centre's own fee, separate from the
   NeuroBridge subscription. (Zero-cost for now, same as above: the step exists,
   the amount is 0.)
4. The child becomes a **member**: `CentreMembership` is active, and the centre can
   now push events to their calendar.

### Leaving a centre

Decided rule: **the child's own content persists; the centre's content leaves.**

| | On leaving |
|---|---|
| Lessons, schedules, points, notes, IEP, documents, test history | **stay** — they are the child's |
| Guides and specialists | **stay** — they are tied to the child |
| Centre **events** on the calendar | **removed** (future ones; past ones stay as history) |
| Centre-authored shared lessons already copied into the child's library | **stay** (they were copied, not linked) |

So the calendar loses the centre's events and nothing else. Implementation note:
this is why events must be *linked* to the centre rather than flattened into
ordinary blocks — the link is what makes clean removal possible.

---

## 5. Inviting a guide (email workflow)

This replaces the admin-created-account path, and resolves the dead end where a
homeschool parent had no way to give their spouse access.

1. Parent enters the guide's email on their child's **People** section.
2. If an account exists → confirm the person by **name** (already built) and grant.
3. If not → an **invitation** is created and emailed. The guide follows the link,
   sets their own password, and lands directly on that child.
4. Invitations expire, can be revoked, and are visible as *pending* in People.

The parent can revoke a guide at any time. **A guide never needs a centre**, which
means `User.centerId` must become genuinely optional and the "Pick a centre"
requirement on account creation has to go.

---

## 6. Centre events — the interesting part

A centre runs things: a science fair, a swimming block, a group outing. It needs to
get them onto children's calendars **without seizing control of anyone's day**.

### The rule

An event is **proposed, never imposed**. The centre pushes it; the guide or parent
accepts it. A centre cannot silently rearrange a child's schedule — that would
break the promise that the family owns the plan.

### The flow

1. **Centre admin creates an event**: title, date, start/end, description, and who
   it is for — *all members* or *selected children*.
2. Each child gets a **pending invitation**, surfaced in the guide's existing
   "Needs your approval" queue and to the parent.
3. Accepting is where the care goes — see below.
4. Declining is one click and tells the centre admin, who sees a simple roster:
   accepted / declined / no answer.

### Accepting elegantly: the conflict is the whole problem

A 10:00–12:00 event lands on top of Math, Reading and a break. Asking the guide to
hand-move four blocks is exactly the drudgery the product exists to remove. So the
accept screen **proposes a concrete rearrangement** and lets them take it in one
click:

```
Sunrise Centre · Science Fair · Friday 10:00–12:00

This overlaps 3 blocks on Friday:
   10:00  Math      → move to 13:00
   10:30  Reading   → move to 13:30
   11:00  Break     → drop (there's already a break at 12:30)

   [ Accept and rearrange ]   [ Accept, I'll sort it out ]   [ Decline ]
```

Rules for the proposal, in priority order:

1. **Never silently lose an Education block.** Move it into free/flexible time the
   same day if possible.
2. If the day has no room, **carry it to the next day** with room, keeping subject
   order.
3. If it still does not fit, **drop it and say so** — a dropped topic resurfaces in
   next week's plan anyway, which is already how the planner behaves.
4. **Breaks and electives yield first**; lunch is never moved.
5. Anything already **done** is never touched.

"Accept, I'll sort it out" places the event and leaves the collisions visible on
the calendar, so a guide who wants control keeps it. Both **parent and guide** can
do any of this — they are equals for day-to-day work.

### After acceptance

The event becomes a block on the child's calendar of kind `event`, owned by the
centre: it shows the centre's name, is not an Education block, earns no coins, and
is removed if the child leaves the centre. The guide can still move it locally —
their calendar, their call — without affecting anyone else.

---

## 7. Schema sketch

```prisma
model Subscription {
  id        String   @id @default(cuid())
  userId    String   // the PARENT owns it; transferable with them
  plan      String   @default("free")
  amountCents Int    @default(0)
  status    String   @default("active") // active | past_due | cancelled
  startedAt DateTime @default(now())
}

model CentreMembership {
  id          String    @id @default(cuid())
  childId     String
  centerId    String
  status      String    @default("requested") // requested | active | declined | left
  requestedById String                        // always the parent
  approvedById  String?
  feeCents    Int       @default(0)
  requestedAt DateTime  @default(now())
  decidedAt   DateTime?
  leftAt      DateTime?

  @@unique([childId, centerId])
}

model CentreEvent {
  id        String   @id @default(cuid())
  centerId  String
  title     String
  detail    String   @default("")
  date      String
  startMin  Int
  endMin    Int
  audience  String   @default("all") // all | selected
  createdById String
  createdAt DateTime @default(now())
  invites   CentreEventInvite[]
}

model CentreEventInvite {
  id        String   @id @default(cuid())
  eventId   String
  childId   String
  status    String   @default("pending") // pending | accepted | declined
  slotId    String?  // the block created on acceptance, so leaving can remove it
  decidedById String?
  decidedAt DateTime?

  @@unique([eventId, childId])
}

model GuideInvitation {
  id        String    @id @default(cuid())
  childId   String
  email     String
  token     String    @unique
  invitedById String
  expiresAt DateTime
  acceptedAt DateTime?
}
```

`ScheduleSlot` gains `kind: "event"` and an optional `centreEventInviteId`, which is
what makes centre content cleanly removable.

---

## 8. What this changes in the existing code

- **`Child.centerId` stops being the source of truth** for membership;
  `CentreMembership` is. The column can stay as a denormalised pointer.
- **`User.centerId` must be genuinely optional.** Guides are not centre staff.
  Account creation currently *requires* a centre (`"Pick a center."`) — that has to
  go, or centre-less guides remain impossible.
- **`canOperateChild` already reads `ChildAccess`**, so multi-guide works. But
  `center_admin` currently gets full management of any child in their centre. Under
  this design a centre admin should manage **membership and events**, not the
  child's lessons and IEP. That is a real narrowing and needs deciding.
- **Self-serve signup** is new surface: public registration, email verification,
  and password reset — none of which exist today.
- **Email delivery** becomes load-bearing for the first time (guide invitations,
  join requests, event pushes). Specialist codes are still handed over manually;
  this is the moment to build sending properly.

---

## 9. Open questions

1. **Does a centre admin see a member child's IEP?** They approve the child and run
   events; that does not obviously require clinical documents. Recommend **no** by
   default, with the parent able to share explicitly.
2. **Can a child belong to more than one centre?** The schema allows it. Probably
   yes (a maths centre and a therapy centre), but events from both then compete for
   the same calendar.
3. **Who pays the centre — parent to centre directly, or through NeuroBridge?**
   Affects whether we ever touch money and therefore how much compliance follows.
4. **Verification.** Anyone can claim to be a parent. For a free product that is
   acceptable; before Medicaid caregiver reimbursement it will not be.
