# Where things stand

Handoff, end of 27 July 2026. Read this first in a new session.

`main` is clean and pushed. Everything below is deployed to GitHub; **Vercel has
not been redeployed since the Supabase Storage variables were added**, so media
does not work in production yet.

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
2. **A deliberate sweep for ownership-as-permission.** Four bugs today were the
   same root cause: code written before `ChildAccess` existed used
   `Child.teacherId` or `user.children` as an authorisation. Found in the
   roster, the centre-admin check, the prize list, and the redemption feed —
   that last one leaked one family's redemptions to another. There are almost
   certainly more. `grep` for `teacherId` used as a permission.
3. **Coding via Code.org** — see [beyond-school.md](beyond-school.md). Smallest
   real content win, because CSTA is national.
4. **Centre activities** — brainstormed, never designed. A centre has a roster
   and a join flow but no timetable, no activities, no enrichment.

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
