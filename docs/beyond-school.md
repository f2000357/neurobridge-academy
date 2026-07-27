# Beyond school

Design note, 2026-07-27. Nothing here is built.

Three expansions were asked for — more content providers, more states, beyond
the IEP — but they are consequences of a fourth thing, which is really a
restatement of what the product is:

> Starts early, with the parent as the caregiver, with a continuously adapting
> support system for the child.

That sentence removes the school/homeschool framing entirely, and it is stronger
than what the deck says today.

---

## 0. The reframe, first

Everything currently assumes school: a grade level, a standards framework, an
IEP, a 9-to-3 day. Useful, and it is where the first family is. But it makes
school the organising idea, when school is one phase of a much longer thing.

**Every professional in a neurodiverse child's life rotates.** Early
intervention ends at three. Teachers change every year. Therapists come and go,
waitlists open and close, insurance changes. The IEP team is not the same team
two years running.

**The parent is the only permanent participant.** Building the record and the
plan around the constant — rather than around whichever institution currently
holds the file — is what makes birth-to-eighteen a continuum instead of three
disconnected products.

That is also why the child's records already belong to the child rather than a
teacher or a centre, and why the parent is the only one who can edit the
introduction. Those decisions were made for other reasons and happen to be the
right foundation for this.

**What follows from it**

- The unit is a **child's file**, not a school year. It survives every
  transition and every change of professional.
- The plan adapts to whatever phase the child is in — routines-based support at
  two, standards-aligned lessons at eight — without becoming a different app.
- "Homeschool or school" becomes a setting on the file, not the identity of the
  product. It already almost is.

---

## 1. More providers

**Already built.** `lib/providers.ts` is a registry with a commented MobyMax
template, written when this was anticipated. A child carries a CSV of what the
family subscribes to; `preferredOrder` ranks indexed providers first.

**The real work is the index, not the registry.** IXL works because there is a
crawled, standards-aligned catalog behind it, so the AI picks a standard and the
index supplies a real skill URL. A provider without that is just a link to a
homepage.

Per provider, the cost is:

1. A crawlable, public, standards-aligned catalog
2. A crawler that respects robots.txt and rate limits — the existing rules stand
3. A mapping from standard code to skill URL

The constraints do not move: **deep links only, never embedded content, never a
stored child credential, never AI-authored lessons.**

### Coding specifically

The obvious next subject, and the easiest — because **CSTA is national**. No
fifty-state problem. One framework everyone maps to.

Candidates, both free with browsable catalogs:

- **Code.org CS Fundamentals** — six courses, one per elementary grade, mapped
  to CSTA K–5. Stable per-lesson URLs.
- **CodeHS** — 100+ K-12 courses, browser-based, aligned to state standards and
  CTE pathways.

Coding also earns its place for this population specifically: it is a common
special interest, it rewards systematic thinking, and it is one of the few
school subjects that is genuinely a career.

**Open question.** Does a coding lesson sit in a Core block or an Elective?
Academically it is core; motivationally it may be the thing that gets a child to
the desk. Probably a family choice, not ours.

---

## 2. Beyond New Jersey

**Half built.** `getStandards()` is pluggable, `standardsForState()` exists, and
every child now carries a `stateCode`. The Setup screen already says plainly
when a state's own standards are not held.

**What is missing is data, not architecture** — the standard sets themselves,
per state, per subject, per grade. Mechanical but real: each is a few hundred
codes with human-readable descriptions.

**Sequence it by demand.** The centre-interest form and the state field on each
child are already collecting exactly the signal needed: which states families
are actually in. Add the state they ask from, not the biggest state.

**Shortcut worth checking.** Most states' maths and ELA standards are Common
Core–derived, and NJSLS already is. A CCSS spine with per-state overlays may
cover most of the country for far less work than fifty independent sets. Worth
an hour of investigation before committing to the brute-force path.

---

## 3. Beyond the IEP — early intervention

The deepest of the three, and the one that is **not** a smaller version of what
exists.

Birth-to-three runs on an **IFSP**, not an IEP, and the difference is not
cosmetic:

| | IEP | IFSP |
|---|---|---|
| Centred on | the child | the **family** |
| Goals | academic and functional | developmental, written into **daily routines** |
| Setting | school | home and natural environments |
| Delivered by | school staff | early-intervention providers, coaching the parent |
| Reviewed | annually | every six months, with a transition plan at three |

**What breaks if we pretend it is the same**

- The grade-gap model has nothing to compare against. There is no grade.
- The standards spine does not apply. Developmental milestones are not
  standards, and no state publishes them as a skill catalog.
- The 9-to-3 day is wrong. A two-year-old's plan is embedded in mealtimes,
  nappies, play — not a timetable.
- The whole content pipeline assumes a provider catalog of practice skills.
  There is no IXL for eighteen-month-olds, and there should not be.

**What transfers, and it is a lot**

- The child's file, the record that follows them
- Multi-provider coordination — arguably more valuable here, since EI families
  routinely have four or five providers at once
- Session notes, and the parent being able to write them
- Document review: an IFSP is exactly the kind of document the IEP review
  already reads well
- The advocacy loop — evidence a parent can bring to a review

**What the plan becomes at that age.** Not a timetable of lessons. A short list
of **routines-based targets** — "practises requesting during snack" — with the
therapists' notes attached and the parent recording what happened. The adaptive
loop still applies; only the unit changes, from lesson to routine.

**The transition at three is the killer feature.** Moving from IFSP to IEP is
one of the hardest, most paperwork-heavy moments a family goes through, and
every system involved drops the file. A product that carries three years of
evidence into that meeting is worth more than everything else here combined.

---

## What I would do, in order

1. **Coding via Code.org.** Smallest real win: national standards, free catalog,
   proves the provider registry with a second subject and gives families
   something they will actually want.
2. **One more state**, chosen by whoever asks first — after checking whether a
   CCSS spine collapses the work.
3. **Early intervention as its own mode**, not a variant. Start with the file
   and the coordination, which already work, and leave the plan generator alone
   until routines-based targets are designed properly.

And update the deck. Slide 1 currently says "the child at the centre, the parent
at the wheel," which is right but sounds like a school product. The truer line
is that the parent is the only constant, and the file follows the child from
first concerns onward.

## Open questions

- Does early intervention need a separate app surface, or is it the same file
  with a different plan type? (I think the latter — but the day view assumes a
  timetable and would need to not.)
- Do we ever hold a provider catalog that is not free? IXL is a paid family
  subscription we deep-link into; Code.org is free. A paid catalog we cannot
  crawl breaks the model.
- Is "school-age" ever a hard switch, or does the file just gradually change
  shape? A hard switch is easier to build and probably wrong.
