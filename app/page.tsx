import Link from "next/link";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import LoginMenu from "./LoginMenu";
import HubDiagram from "./HubDiagram";
import CentreInterest from "./CentreInterest";

export const dynamic = "force-dynamic";

// The public landing page — the only page a stranger sees.
//
// Written to be SCANNED, not read: the picture carries the argument, and the
// words around it stay short enough to take in at a glance. A parent deciding
// whether this is for them should know within about ten seconds.
//
// A signed-in visitor still gets the marketing page (they may have followed a
// link, or be showing someone around), but the nav swaps the login menu for a
// way straight back to their console.

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="wrap lp-nav-inner">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            NeuroBridge Academy
          </div>

          <div className="lp-links">
            <a href="#how">How the AI works</a>
            <a href="#profile">Learning profile</a>
            <a href="#team">Your team</a>
            <a href="#centres">Centres</a>
            <a href="#contact">Contact</a>
          </div>

          <div className="lp-auth">
            {user ? (
              <Link href={homeForRole(user.role)} className="btn">
                Continue as {user.name.split(" ")[0]} →
              </Link>
            ) : (
              <>
                <LoginMenu />
                <Link href="/signup" className="btn">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main>
        {/* ---- the whole idea, in one picture ---- */}
        <section className="lp-hero">
          <div className="wrap">
            <p className="lp-eyebrow">Built for neurodiverse learners</p>
            <h1>The child at the centre. The parent at the wheel.</h1>
            <p className="lp-sub">
              School, therapies, testing and home all touch your child — and none of them talk. The
              AI connects them into one adaptive plan. You approve it.
            </p>

            {/* Both settings, said before anything else. Most families assume a
                tool like this means leaving school. */}
            <div className="lp-paths">
              <span className="lp-path">
                <b>In school?</b> We plan the hours around it.
              </span>
              <span className="lp-path-join" aria-hidden="true">
                both
              </span>
              <span className="lp-path">
                <b>At home?</b> We plan the whole day.
              </span>
            </div>

            <HubDiagram />

            <div className="lp-cta-row">
              <Link href="/signup" className="btn big">
                Start with your child
              </Link>
              <a href="#how" className="btn quiet big">
                How it works
              </a>
            </div>
            <p className="lp-note">Free while we&apos;re building. No card.</p>
          </div>
        </section>

        {/* ---- the coordinating loop ----
            "AI-powered" means nothing alone. These are the three things the
            system does, in order, and the loop closes — which is what separates
            coordination from a one-off plan. */}
        <section className="lp-section tint" id="how">
          <div className="wrap">
            <p className="lp-eyebrow">How it works</p>
            <h2>
              The <span className="lp-hl">AI</span> reads everything, plans the week, then adapts.
            </h2>

            <div className="lp-loop">
              <div className="lp-loop-step">
                <p className="lp-loop-n"><span>AI</span> reads</p>
                <p>The IEP, test scores, therapy notes, and what your child finished yesterday.</p>
              </div>
              <span className="lp-loop-arrow" aria-hidden="true">
                →
              </span>
              <div className="lp-loop-step">
                <p className="lp-loop-n"><span>AI</span> plans</p>
                <p>A week of standards-aligned lessons, each linked to the exact activity.</p>
              </div>
              <span className="lp-loop-arrow" aria-hidden="true">
                →
              </span>
              <div className="lp-loop-step">
                <p className="lp-loop-n"><span>AI</span> adapts</p>
                <p>Struggled? It comes back. Mastered? It moves on. Then the loop repeats.</p>
              </div>
            </div>

            {/* Two anchors, one gap. Naming both ends is what stops
                "personalised" quietly meaning "lowered". */}
            <div className="lp-gap">
              <div className="lp-gap-track" role="img"
                   aria-label="A track from the level the child works at now to the grade-level standard, closing week by week">
                <span className="lp-gap-fill"></span>
                <span className="lp-gap-dot now"></span>
                <span className="lp-gap-dot goal"></span>
              </div>
              <div className="lp-gap-legend">
                <div className="lp-gap-end">
                  <b>Where they are</b>
                  <span>Their real working level</span>
                </div>
                <div className="lp-gap-mid">closing, week by week</div>
                <div className="lp-gap-end right">
                  <b>Where they need to be</b>
                  <span>The grade-level standard</span>
                </div>
              </div>
            </div>

            <p className="lp-loop-close">
              The AI never stops adjusting — below grade level is a gap with a deadline,{" "}
              <strong>not a label</strong>.
            </p>
          </div>
        </section>

        {/* ---- the profile, on demand ----
            Three cards describing a document are weaker than the document. This
            renders the real thing — levels against standards, goal statuses, a
            generated-today stamp — and is labelled an example so it never reads
            as one child's actual record. */}
        <section className="lp-section" id="profile">
          <div className="wrap">
            <p className="lp-eyebrow">Learning profile</p>
            <h2>Know where your child stands. Today, not last term.</h2>
            <p className="lp-lead">
              Schools report twice a year. We have it ready today.
            </p>

            <figure className="lp-profile">
              <div className="lp-profile-head">
                <div>
                  <p className="lp-profile-title">Learning profile</p>
                  <p className="lp-profile-sub">Grade 3 · NJ state standards</p>
                </div>
                <span className="lp-profile-stamp">Generated today</span>
              </div>

              <div className="lp-profile-body">
                <p className="lp-profile-section">Where they are</p>

                <div className="lp-subject">
                  <span className="lp-subject-name">Maths</span>
                  <span className="lp-bar">
                    <span className="lp-bar-fill" style={{ width: "46%" }}></span>
                  </span>
                  <span className="lp-subject-lvl">
                    Grade 1 <em>→</em> Grade 3
                  </span>
                </div>

                <div className="lp-subject">
                  <span className="lp-subject-name">Reading</span>
                  <span className="lp-bar">
                    <span className="lp-bar-fill" style={{ width: "72%" }}></span>
                  </span>
                  <span className="lp-subject-lvl">
                    Grade 2 <em>→</em> Grade 3
                  </span>
                </div>

                <div className="lp-subject">
                  <span className="lp-subject-name">Writing</span>
                  <span className="lp-bar">
                    <span className="lp-bar-fill" style={{ width: "88%" }}></span>
                  </span>
                  <span className="lp-subject-lvl">
                    Grade 3 <em>→</em> Grade 3
                  </span>
                </div>

                <p className="lp-profile-section">IEP goals</p>
                <ul className="lp-goals">
                  <li>
                    <span className="lp-goal-pill good">On track</span>
                    Counts back from 20 without prompting
                  </li>
                  <li>
                    <span className="lp-goal-pill warn">Needs work</span>
                    Two-digit place value
                  </li>
                  <li>
                    <span className="lp-goal-pill met">Met</span>
                    Reads short-vowel words aloud
                  </li>
                </ul>

                <div className="lp-profile-foot">
                  <span>
                    <b>24</b> standards mastered this term
                  </span>
                  <span>
                    <b>6</b> weeks of therapy notes
                  </span>
                  <span className="lp-profile-export">Export ⤓</span>
                </div>
              </div>
            </figure>
            <figcaption className="lp-profile-cap">
              Example profile. Yours is built from your child&apos;s own records.
            </figcaption>
          </div>
        </section>

        {/* ---- the team around the child ----
            Same move as the profile section: show the roster rather than
            describing it. One picture carries all three claims — everyone in one
            place, each specialist scoped to their own activity, and access the
            parent can withdraw. */}
        <section className="lp-section tint" id="team">
          <div className="wrap">
            <p className="lp-eyebrow">Your team</p>
            <h2>Everyone who works with your child, in one place.</h2>
            <p className="lp-lead">
              Therapists, teachers, a substitute when someone&apos;s away. They see the whole day —
              and write only against their own sessions.
            </p>

            <figure className="lp-roster">
              <div className="lp-roster-child">
                <span className="lp-avatar child" aria-hidden="true">
                  P
                </span>
                <div>
                  <p className="lp-roster-name">Your child</p>
                  <p className="lp-roster-meta">
                    Your photo, your words — what they like, what to avoid
                  </p>
                </div>
                <span className="lp-scope you">Only you can edit</span>
              </div>

              <ul className="lp-roster-list">
                <li>
                  <span className="lp-avatar a" aria-hidden="true">
                    G
                  </span>
                  <div>
                    <p className="lp-roster-name">You</p>
                    <p className="lp-roster-meta">Parent · primary guide</p>
                  </div>
                  <span className="lp-scope full">Everything</span>
                </li>
                <li>
                  <span className="lp-avatar b" aria-hidden="true">
                    M
                  </span>
                  <div>
                    <p className="lp-roster-name">Maya R.</p>
                    <p className="lp-roster-meta">ABA · mornings</p>
                  </div>
                  <span className="lp-scope">Notes on ABA only</span>
                </li>
                <li>
                  <span className="lp-avatar c" aria-hidden="true">
                    D
                  </span>
                  <div>
                    <p className="lp-roster-name">Dev S.</p>
                    <p className="lp-roster-meta">Occupational therapy</p>
                  </div>
                  <span className="lp-scope">Notes on OT only</span>
                </li>
                <li>
                  <span className="lp-avatar d" aria-hidden="true">
                    A
                  </span>
                  <div>
                    <p className="lp-roster-name">Ana L.</p>
                    <p className="lp-roster-meta">Music · Thursdays</p>
                  </div>
                  <span className="lp-scope">Notes on music only</span>
                </li>
              </ul>

              <div className="lp-roster-foot">
                <span className="lp-roster-add">+ Invite someone</span>
                <span className="lp-roster-revoke">Remove anyone, any time ⚿</span>
              </div>
            </figure>
            <figcaption className="lp-profile-cap">
              Example team. Sign-in links are one-time — remove someone and access ends on their next
              reload.
            </figcaption>
          </div>
        </section>

        {/* ---- centres: the idea, not a promise ----
            Flagged "coming soon" and written as an intention rather than a
            product, because none of it exists yet. The interest link is a plain
            mailto — no form, no list, nothing collected that we can't honour. */}
        <section className="lp-section" id="centres">
          <div className="wrap">
            <div className="lp-soon-row">
              <p className="lp-eyebrow" style={{ margin: 0 }}>NeuroBridge Centres</p>
              <span className="lp-soon">Coming soon</span>
            </div>
            <h2>Homeschooling, without the isolation.</h2>
            <p className="lp-lead">
              The software handles the curriculum. It can&apos;t give your child friends, or give you
              someone who understands. A NeuroBridge centre is a room that does — where families
              bring their own plans and run their day together.
            </p>

            {/* A plan of the place, not a list of its features. The commons is
                the largest room and the only coloured one — everything else is a
                facility, that is the reason to come. */}
            <figure className="lp-plan">
              <svg
                viewBox="0 0 900 540"
                role="img"
                aria-label="Floor plan of a NeuroBridge centre: a large central commons, with a movement and XR bay, a BCBA room, a programme room, a quiet room and a parent table around it."
              >
                <defs>
                  <linearGradient id="planCommons" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" />
                    <stop offset="100%" stopColor="var(--coral)" />
                  </linearGradient>
                </defs>

                <rect className="pl-wall" x="26" y="26" width="848" height="466" rx="18" />

                {/* left */}
                <rect className="pl-room" x="48" y="48" width="242" height="196" rx="13" />
                <text className="pl-name" x="68" y="82">Movement &amp; XR</text>
                <text className="pl-sub" x="68" y="106">Whole-body activity, no team</text>
                <text className="pl-sub" x="68" y="126">picking, low sensory load</text>

                <rect className="pl-room" x="48" y="272" width="242" height="196" rx="13" />
                <text className="pl-name" x="68" y="306">BCBA on site</text>
                <text className="pl-sub" x="68" y="330">Helps shape your plan — and</text>
                <text className="pl-sub" x="68" y="350">a path to your own RBT</text>
                <text className="pl-tag" x="68" y="446">Get ready for your future</text>

                {/* the heart */}
                <rect className="pl-commons" x="312" y="48" width="276" height="420" rx="15" />
                <text className="pl-commons-name" x="450" y="128" textAnchor="middle">The commons</text>
                <text className="pl-commons-sub" x="450" y="154" textAnchor="middle">WHERE THEY MEET</text>
                <g className="pl-people">
                  <circle cx="384" cy="228" r="11" /><circle cx="424" cy="216" r="11" />
                  <circle cx="466" cy="230" r="11" /><circle cx="508" cy="218" r="11" />
                  <circle cx="398" cy="280" r="11" /><circle cx="448" cy="288" r="11" />
                  <circle cx="498" cy="278" r="11" /><circle cx="372" cy="336" r="11" />
                  <circle cx="420" cy="346" r="11" /><circle cx="476" cy="338" r="11" />
                  <circle cx="520" cy="330" r="11" />
                </g>
                <text className="pl-commons-sub" x="450" y="404" textAnchor="middle">
                  LUNCH · FREE PLAY · CLUBS
                </text>
                <text className="pl-commons-sub dim" x="450" y="430" textAnchor="middle">
                  PARENTS STAY
                </text>

                {/* right */}
                <rect className="pl-room" x="610" y="48" width="242" height="196" rx="13" />
                <text className="pl-name" x="630" y="82">Programme room</text>
                <text className="pl-sub" x="630" y="106">Each child works their own</text>
                <text className="pl-sub" x="630" y="126">NeuroBridge plan, side by side</text>

                <rect className="pl-room" x="610" y="272" width="242" height="88" rx="13" />
                <text className="pl-name" x="630" y="306">Quiet room</text>
                <text className="pl-sub" x="630" y="330">Always open, no permission needed</text>

                <rect className="pl-room" x="610" y="380" width="242" height="88" rx="13" />
                <text className="pl-name" x="630" y="414">Parent table</text>
                <text className="pl-sub" x="630" y="438">Coffee, and someone who gets it</text>

                <line className="pl-door" x1="418" y1="492" x2="482" y2="492" />
              </svg>
            </figure>

            <CentreInterest />
          </div>
        </section>

        {/* ---- contact ---- */}
        <section className="lp-section" id="contact">
          <div className="wrap">
            <p className="lp-eyebrow">Contact</p>
            <h2>Talk to a person, not a form.</h2>
            <p className="lp-lead">
              NeuroBridge is small and early — you reach the person building it.
            </p>

            <div className="lp-contact">
              <a className="lp-contact-card" href="mailto:Gayathri@gmail.com">
                <span className="lp-ico" aria-hidden="true">
                  ✉
                </span>
                <span className="lp-contact-label">Email</span>
                <span className="lp-contact-value">Gayathri@gmail.com</span>
              </a>

              <a className="lp-contact-card" href="tel:+16166358303">
                <span className="lp-ico teal" aria-hidden="true">
                  ✆
                </span>
                <span className="lp-contact-label">Phone</span>
                <span className="lp-contact-value">(616) 635-8303</span>
              </a>
            </div>
          </div>
        </section>

        {/* ---- closing ---- */}
        <section className="lp-section">
          <div className="wrap">
            <div className="lp-final">
              <h2>See a week planned before you decide anything.</h2>
              <div className="lp-cta-row">
                <Link href="/signup" className="btn big btn-oncolor">
                  Start with your child
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="wrap lp-foot-inner">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            NeuroBridge Academy
          </div>
          <div className="lp-foot-links">
            <a href="#how">How the AI works</a>
            <a href="#profile">Learning profile</a>
            <a href="#team">Your team</a>
            <a href="#centres">Centres</a>
            <a href="#contact">Contact</a>
            <Link href="/login">Parent sign in</Link>
            <Link href="/teach">Therapist sign in</Link>
          </div>
          <p className="lp-fine">
            © {new Date().getFullYear()} NeuroBridge Academy · Learners sign in at their own link.
          </p>
        </div>
      </footer>
    </div>
  );
}
