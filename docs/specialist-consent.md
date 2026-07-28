# The specialist consents

Design note, 2026-07-28. Nothing here is built.

The brief, in Gayathri's words:

> Specialist setup has to be bound to an email address as primary, and once added
> to the system it should trigger an email. I should be able to discover the
> therapist I added to assign to my child, OR see all therapists who have already
> consented to being discoverable. But either way that should trigger sending a
> notification to the therapist, and the therapist should accept the child.

---

## Why this is one change and not four

Three bugs surfaced in one sitting, and they are the same bug wearing different
clothes:

- A parent can bind **any** specialist to their child. `assign` checks that you
  manage the *child* and checks nothing about the *teacher*.
- The grant takes effect immediately. `TeacherAssignment` has no status — the row
  **is** the access.
- `create` returns a specialist's real name and specialty for any email typed,
  ignoring `listed` — the flag we set aside specifically to record whether they
  agreed to be findable.

Each is a case of the family's consent being modelled carefully and the
specialist's not being modelled at all. The specialist is the only participant in
the system with no say in who they work with, and no say in who can learn they
exist. That is the thing to fix; the three bugs close as a consequence.

---

## What is already true

- **Email is the identity key.** `SpecialistTeacher.email` is `@unique` — "one
  profile per person". The brief's first requirement needs no schema change.
- **A guide can now see specialists they added** even before assigning one
  (fixed 2026-07-28). That is discovery path (a).
- **The directory is discovery path (b)** and already works: opt-in, rate
  limited, `listed: true` only, no ratings and no counts.
- **`CenterJoinRequest` is the pattern to mirror** — `status`, `decidedAt`,
  `decidedByName`, `decidedNote`. Pointed the other way: there the parent asks
  and the centre decides; here the parent asks and the *specialist* decides.

---

## 1. Adding someone always tells them

Two ways in, one rule: **nobody is added silently.**

| How they were added | What we send |
|---|---|
| Added **with** a learner (the one-step form) | One email: *a family would like you to work with a learner* — accept or decline |
| Added **without** a learner | *You've been added to NeuroBridge* — sign in, set up your profile, choose whether to be listed |
| Found via the **directory** and asked | Same as the first row. Being listed is consent to be *found*, never consent to be *assigned* |

That last line matters. Opting into the directory must not become a blanket
agreement to take on whoever clicks.

## 2. The assignment becomes a request

`TeacherAssignment` gains the `CenterJoinRequest` shape:

```
status        String    @default("pending")  // pending | accepted | declined | withdrawn
requestedById String
decidedAt     DateTime?
decidedNote   String    @default("")
```

**`teacherCanSee` requires `accepted`.** That one line is the whole security
change; everything else is flow around it.

Before accepting, the specialist sees only: who is asking, the learner's first
name, and the subject. Not the day, not the notes, not the photographs.

**Existing rows are grandfathered to `accepted`** — they were created under the
old rule and the families still expect them to work. There is exactly one
specialist and zero assignments in the database today, so this costs nothing now,
and it is the right rule if that changes before this ships.

Either side can end it: the family unassigns, the specialist declines or resigns.
Notes already written stay either way — they are the learner's record, not the
teacher's.

## 3. The family can see what they sent, and send it again

An invitation that lands in a spam folder currently ends the story: the token
lasts seven days, nothing in the guide UI shows it was ever sent, and there is no
way to send another. The parent's only recourse is to add the teacher a second
time, which does nothing, because the profile already exists.

Each specialist's card shows the state of the relationship, in the family's own
terms:

| State | What the card says | Resend? |
|---|---|---|
| Invited, not yet opened | *Invited 3 days ago — not answered yet* | yes |
| Link expired | *Invitation expired* | yes, prominently |
| Accepted | *Working with Prithvi since 2 August* | no — nothing to resend |
| Declined | *Declined* | **no** |
| Email failed to send | *Couldn't be emailed* + the link to pass on by hand | yes |

**Resend** re-issues the token exactly as `/api/teach-link` already does —
delete the unused ones, mint a fresh seven-day token, send the same careful
first-request email. It never reveals anything new: this is a person the family
named themselves.

Three rules keep it from becoming a way to harass someone:

1. **A decline is final.** No resend, and no re-inviting the same specialist to
   the same learner. A parent who genuinely needs to re-ask can do it outside the
   product, which is the correct place for that conversation.
2. **Rate limited**, reusing the `tooMany` helper the directory search already
   uses — keyed on the specialist, not the parent, so several families cannot
   collectively flood one inbox.
3. **No open tracking.** We show what *we* did — sent, expired, answered — never
   whether they read it. A therapist's attention is not the family's to monitor.

We do not tell the family the invitation was *delivered*, only that it was sent.
Resend's own failure surfaces the fallback link, same as everywhere else.

## 4. `create` stops naming people

Today, typing an email into the add-a-teacher form returns that person's real
name and specialty if they exist. Any signed-in user, unrate-limited, `listed`
ignored. It is a better identity oracle than the directory it bypasses.

The response becomes the same whether or not the profile existed:

```json
{ "ok": true, "invited": true }
```

The parent typed the name themselves, so the confirmation echoes **their input**,
never our record. If a profile already exists under a different spelling, the
stored name wins and is not shown — a second family must not be able to rename
someone, or to learn what the first family called them.

The same reasoning fixes `/api/teach-link`, which promises in its own comment to
respond identically for known and unknown addresses and does not. Both are the
same disclosure, and they should be closed in the same pass.

## 5. Something that fails when this drifts again

Three invariants were written down correctly in comments and violated in code —
`ChildAccess` as the authorization source, the vague `teach-link` response, and
`listed`. Comments did not hold the line. Tests have to.

`tests/authz.mjs` was meant to be that net and has been broken since before this
session: it signs in as `gayathri@dev.neurable` with `neurable-dev`, but the
account is `gayathri@dev.neurobridge` and the seed sets `neurobridge-dev`, and its
child fixtures predate the current seed. Repairing it is part of this work, not a
follow-up.

It should assert, at minimum:

- a pending specialist sees **nothing** — day, notes, media all 403
- accepting grants exactly the assigned learner and no other
- declining grants nothing, and cannot be undone by re-assigning
- `create` returns an identical response for a known and an unknown email
- `/api/teach-link` likewise
- an unlisted specialist never appears in a directory search

Note that `prisma/seed-passwords.mjs` overwrites **every** account's password,
including the three real ones. Repairing the test must not depend on running it.

---

## How much the request email says — decided

**Careful first, warm after.** Decided 2026-07-28.

The **first** request between a family and a specialist names nobody:

> A family on NeuroBridge would like you to work with one of their learners.
> Sign in to see who's asking and accept or decline.

Once there is an accepted relationship, later mail uses names normally — that is
the product's voice and there is no reason to withhold it from someone who has
already agreed to work with the family.

The reason is the typo case, which is the realistic risk here rather than malice:
one wrong character in an address that happens to belong to another registered
specialist. The careful version cannot close it completely — whoever holds that
mailbox can still click the link and read the request — but it narrows the
disclosure to someone who actively acts on it, and it makes declining a recorded
event rather than a silent read.

It costs warmth at exactly the moment a real therapist is deciding whether this
product is worth their time. That is the trade, made knowingly.

---

## What I would do, in order

1. **`status` on `TeacherAssignment`, and `teacherCanSee` requiring `accepted`.**
   The security fix. Small, and everything else depends on it.
2. **The accept/decline screen** — the **Approvals** tab on `/teach`, which
   exists and is empty until this ships. It is deliberately the first tab: it is
   the only one of the three that is a person waiting on them. The tab opens on
   Students or Profile for now, since Approvals cannot yet hold anything.
3. **Emails** — added-with-learner, added-alone, and the decision above.
4. **The state on the card, and resend.** Cheap once status exists, and it is
   what stops a lost email from ending the relationship silently.
5. **Close the two disclosures** — `create` and `/api/teach-link`, together.
6. **Repair and extend `tests/authz.mjs`.** Do not ship 1–5 without it; that is
   how these three got in.

## Open questions

- Does a **centre** adding a specialist need the same acceptance, or is an
  employment relationship different from a family's request? I think it needs it
  too — a centre is not the specialist's employer by default.
- Should a declined request be visible to the parent as *declined*, or silently
  as *never accepted*? Declined is honest; it also tells a parent something the
  specialist may not wish to say. Leaning honest, with no reason attached.
- Should a specialist be able to leave the directory **and** keep existing
  learners? Almost certainly yes — those are separate consents.
- After the fixes, is `codeSentAt` still meaningful? Its comment says email
  delivery is not built, which stopped being true some time ago.
