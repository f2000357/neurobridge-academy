# Keeping the plan alive

Two failures that look different and are the same bug: **the plan falls behind
or runs out, and nobody is told.**

- A child misses work, it is carried forward, and eventually there is more
  backlog than free blocks. Carry-forward gives up silently.
- A week ends with next week unplanned. Nothing prompts the guide, so the child
  opens Monday to empty blocks and finds out before the adult does.

Neither is a crash. Both are quiet, and both put the consequence on the child.

Written 2026-07-27, after the carry-forward and pull-forward work landed
(`dcd25a9`, `695273a`, `9d9cfbc`). Nothing here is built yet.

---

## Where things stand

Regeneration now:

- never touches a day that has already been lived
- leaves an upcoming block alone if it already holds an unfinished lesson
- carries a missed lesson into the earliest free block of the same subject
- refuses to carry the same lesson twice

The gap is what happens at the edges — too much missed, or nothing ahead.

---

## 1. Backlog

### What it does today

```js
const target = queue.shift();
if (!target) continue;   // no room — stays where it is, silently
```

Miss a fortnight and a dozen lessons sit unscheduled. The response still reports
what it *did* carry, so it reads like success.

### Why "carry everything" is the wrong model

**For the child.** Coming back from a bad fortnight to a wall of catch-up is the
single most likely thing to make a neurodiverse learner refuse the screen. Demand
avoidance is not a character flaw to be planned around; it is the thing the
product exists to reduce.

**Educationally.** A lesson missed three weeks ago may no longer be the right
next step. Replaying it assumes the old sequence still holds — exactly the
assumption an adaptive planner exists to avoid. Backlog should be *evidence*
feeding the next decision, not a queue to be drained.

### The design

**Carry recent work only — the last 5 school days.** Past that, the specific
lesson stops travelling. The *skill* becomes an input to generation ("still not
covered"), and the AI decides whether it is still right, and at what level. That
is the difference between a queue and a plan.

**Cap what a week absorbs** — 2–3 carried lessons per subject, into free blocks
only. Never displace new work. Never fill a week wall-to-wall with catch-up.

**Prioritise, don't FIFO.** Carry what is tied to an IEP goal or the widest
grade gap first. If only three things come back, they should be the three that
matter.

**Make it visible and forgivable.**

> 7 lessons weren't reached. Carrying 3. **Ignore the rest?**

One button to clear. The parent decides what is still owed — consistent with
everywhere else: the AI proposes, the parent decides.

**Count it honestly.** "12 planned lessons not completed" belongs in the
learning profile. Hiding it would make the record dishonest, and the record is
the thing a parent takes to a meeting.

---

## 2. Running out of week

### What it does today

`"No upcoming sessions left this week — generate next week instead"` appears
**only if the guide presses Regenerate**. Nothing surfaces otherwise.

So: Monday arrives, the child opens their day, the blocks are there and every
one says "no lesson yet".

### The design

**Draft next week automatically.** From Thursday, generate next week's lessons
as drafts — exactly what the button produces now, unapproved. Nothing is
scheduled, nothing runs. Then email the guide: *"Next week is drafted — review
it."*

This changes the guide's job from *remembering to plan* to *approving a plan*,
which is the same shift the product makes everywhere else. Parent authority is
untouched: an unapproved draft has no effect on the child's day.

**Show it before it bites.** A banner on the guide console from mid-week —
*"Next week has no lessons yet"* — covering the case where the draft failed or
was skipped deliberately.

**Never let the child hit a blank day.** If tomorrow's blocks have no lessons,
their view should say so kindly — *"your guide is setting up the next few
days"* — rather than presenting empty slots as though they are the one who has
missed something. A system problem should never look like the child's fault.

---

## The shared piece

Both end in the same place: **one short weekly message telling the guide what
needs a decision.**

> **This week**
> Next week is drafted — 18 lessons ready to review.
> 7 lessons weren't reached. Carrying 3, the ones tied to his IEP goals.

Email works as of today (Resend, verified sending), so delivery already exists.

### Order to build

1. **Visibility first** — the banner, and an honest count in the regenerate
   response. Today's failure is silent, and a parent cannot respond to what they
   cannot see. Everything else is an improvement on top of that.
2. **The cap and the 5-day window** — stops the pile-up getting worse.
3. **Auto-draft on Thursday + the weekly email.**
4. **Prioritising by IEP goal** — the cleverest part, and the least urgent.

### Open questions

- Should a carried lesson look different on the child's day — "from Monday" —
  or just appear as normal work? Marking it is honest; it may also read as a
  reproach.
- If the guide ignores the draft for two weeks running, does anything escalate,
  or is that their business?
- Does the weekly email go to every guide on the child, or only the primary
  guardian?
