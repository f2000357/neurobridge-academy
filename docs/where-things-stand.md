# Where things stand

Handoff, 27 July 2026. Read this first in a new session.

**There are uncommitted changes on `main`** — the ownership-as-permission sweep
(next section). Everything before that is pushed. **Vercel has not been
redeployed since the Supabase Storage variables were added**, so media does not
work in production yet.

---

## Uncommitted: the specialist workflow

Adding a visiting teacher was broken end to end, and the bug was a catch-22:
`specialistsForChildren` only returned teachers who **already had an
assignment**, so a newly added teacher was invisible on `/teacher/specialists`
and in the schedule picker — and the only screen that could assign her was the
one hiding her. The loop back to the create form was the symptom. No email had
ever been sent because email fires on assignment, which was unreachable.

Fixed: a guide now also sees specialists **they created** (`createdById`); the
add form takes a learner and does create + assign + email in one action; and
three pieces of UI copy that implied the teacher had been contacted now tell the
truth, including surfacing the fallback link when a send fails.

Verified at the data layer — the old query returned `[]` for Ms. Colette Adams,
the new one returns her. **Not verified in a browser** (no password, preview
unreliable), so the new form field and messages want a look.

## Design, not built: [specialist-consent.md](specialist-consent.md)

That workflow bug sat on top of a real hole. Any parent can bind **any**
specialist to their child — `assign` checks you manage the *child* and checks
nothing about the *teacher* — and it takes effect immediately, because
`TeacherAssignment` has no status. Separately, `create` returns a specialist's
real name and specialty for any email typed, ignoring `listed`, the flag that
exists precisely to record whether they agreed to be findable.

The design makes the assignment a request the specialist accepts, stops `create`
naming people, and repairs `tests/authz.mjs` as part of the same work. The
email-tone decision is made and recorded. **Read it before touching specialists
again.**

## Uncommitted: the ownership-as-permission sweep

Step 2 of the old "next" list, done. Nine sites treated a `teacherId` field as
an authorization; all now read `ChildAccess` through `lib/authz`.

On real data this was blocking `bpierre0601@gmail.com`, the second guide on
Prithvi, from his report, his note photos, his visiting teachers, and all 87 of
his lessons.

- `lib/report.ts` — `canReport` now takes `child.id` and asks `roleOnChild`.
  Its callers changed shape with it.
- `app/api/media/[mediaId]` — collapsed onto `can(childId, "view")`.
- `app/teacher/layout.tsx`, `app/teacher/specialists`, `app/teacher/library` —
  roster and library read the whole roster, not just what you are primary for.
- `app/api/schedule` `copyToAll` — **was a cross-family write.** It targeted
  every child of the *source child's* primary guide, so a second guide could
  write a day into a family they have no access to. Now scoped to the caller's
  own roster. No two children currently share a primary guide, so nothing
  appears to have been written wrongly, but the shape was there.
- `lib/authz.ts` — new `canEditPlan`/`guardEditPlan`: author, or any guide on
  the child it belongs to. Used by `app/api/lessons` and `app/api/plan`.
  Sharing a lesson outward stays with the author on purpose. `app/api/plan`
  also now preserves the original author instead of reassigning the lesson to
  whoever edited last.

Verified by typecheck, lint (no new problems), and HTTP smoke tests against the
running dev server — every changed route answers, none 500, and an unauthed
caller is still refused. **Not verified in a browser**, and the library and
specialists pages now show more rows than before, so they deserve a look.

`npm run test:authz` **is stale and was already broken** — it logs in as
`gayathri@dev.neurable` / `neurable-dev`, but the account is
`gayathri@dev.neurobridge` and `seed-passwords.mjs` sets `neurobridge-dev`. Its
`MEERA`/`PRITHVI` fixtures are from an older seed. Worth repairing — it is the
only test that guards this boundary. Note `prisma/seed-passwords.mjs`
**overwrites every account's password**, including the three real ones, so it
cannot be run to fix the test without resetting them.

---

## The product, in one line

Not "school, arranged differently." One continuous record and one adapting plan
for a neurodiverse child, with the parent as the constant — see
[beyond-school.md](beyond-school.md).

---

## Accounts

Three, deliberately separate. Passwords were set on 27 July and are not recorded
here on purpose — reset them from the app if lost.

| Email | Role | Lands on |
|---|---|---|
| `gayathri.c.sekar@gmail.com` | NeuroBridge admin | `/admin` |
| `gayathri@gmail.com` | Centre admin, Somerset Cooperative | `/center` |
| `gayathri@dev.neurobridge` | Parent, primary guide of Prithvi | `/teacher` |

There is also a second guide on Prithvi (added by Gayathri) and one child,
**Prithvi Aiyer** — 38 points, four validated completions, ~85 lessons.

`/switch` is **local only** and now lists specialists as well as users, so you
can enter a therapist's seat in one click. It is inert on any production build
regardless of env vars.

---

## What is live

**Landing page** at `/` — the bridge diagram, the AI loop, the learning profile,
the team roster, centres (coming soon) with an interest form, contact.

**Planning** — weekly generation, per-child standards, grade-gap targeting.
Regeneration never touches a lived day, never overwrites unfinished work,
carries missed work forward within a week, capped at 3 per subject.

**Self-driven progress** — a child who finishes well is offered the next lesson
("keep going"), completing the real scheduled block early.

**The team** — specialists sign in by one-time link, see the whole day, write
notes and award points **only on blocks the parent assigned them to**. Guides can
now write notes too.

**The directory** — therapists opt in at first sign-in, searchable by
signed-in guides only, filtered by specialty and town. No ratings, no counts.

**Centres** — parent asks, centre accepts or declines, parent can leave and
keeps everything. Somerset Cooperative exists with one admin.

**Prizes and points** — both per child. Any guide on the child shares one prize
list; whoever ran a session can award its points.

**Email** — Resend, verified, sending. **Media** — Supabase Storage, private
bucket, signed URLs, verified locally.

---

## Waiting on Gayathri

1. **Redeploy Vercel.** The three `SUPABASE_*` variables are set there but the
   running deployment predates them, so media uploads still fail in production.
2. Watch for the **carry-forward** path the first time Prithvi misses a morning
   — it has never fired with real data.

---

## Next, in the order I would take it

1. **[keeping-the-plan-alive.md](keeping-the-plan-alive.md)** steps 3 and 4 —
   auto-draft next week on a Thursday with the weekly email, then prioritise
   carried work by IEP goal. Steps 1 and 2 (the cap and the banner) are done.
2. **[specialist-consent.md](specialist-consent.md)** — the specialist accepts
   before they see a learner, `create` stops naming people, and
   `tests/authz.mjs` is repaired and extended in the same pass. Three invariants
   have now drifted from their own comments; the test is what stops a fourth.
3. **Coding via Code.org** — see [beyond-school.md](beyond-school.md). Smallest
   real content win, because CSTA is national.
4. **Centre activities** — brainstormed, never designed. A centre has a roster
   and a join flow but no timetable, no activities, no enrichment.

The ownership-as-permission sweep that stood here is done — see above. The
pattern is worth re-checking after any new feature: `grep` for `teacherId` used
as a permission rather than as a pointer.

---

## Things to know before changing anything

- **After a schema change, restart the dev server.** It holds a stale Prisma
  client and returns 500s otherwise. This cost time twice today.
- **The browser preview is broken** in this environment — 0px viewport, blank
  screenshots. Verify through DOM inspection, `curl`, and the database. It
  catches logic but **not** layout: two icons sat on top of each other for a
  whole feature before a screenshot revealed it. Ask for one when the change is
  visual.
- **`prisma format` realigns columns**, which silently breaks string-matched
  edits to the schema. Assert before writing.
- Backups of anything deleted go to `backups/` — gitignored, contains PII.

---

## Standing constraints

Never store a child's provider credentials. Deep links only, never embedded
content. Points are native and never imported from a provider's score. No
AI-authored lesson content — the AI picks the standard, the index supplies the
skill. T-codes are never shown outside NeuroBridge admin. Secrets are never
pasted into chat.
