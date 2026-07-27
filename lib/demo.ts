// The passwordless account "Switch" lets you enter any operator account without
// a password. That is a genuine convenience while building, and it is how the
// early demos were walked through.
//
// It is now DEV-ONLY, and not configurable:
//   • local dev (NODE_ENV !== production) → on
//   • any production build                → off, always
//
// It used to be opt-in per deployment via DEMO_SWITCH=1, which is how it ended
// up live on a production host that by then held a real child's IEP, photo,
// home address and doctor. An env var is the wrong place for that decision: it
// is invisible in review, survives redeploys, and nothing about adding real
// data forces anyone to revisit it. So production no longer honours the flag at
// all — DEMO_SWITCH can be set or unset and it changes nothing.
//
// To sign in on a deployed build, use /login.
export const switchEnabled = process.env.NODE_ENV !== "production";

/**
 * True when the passwordless switch is live on a hosted build — now impossible
 * by construction. Kept so callers that warn about it stay correct, and so the
 * banner disappears rather than the import breaking.
 */
export const demoSwitchOnHostedBuild = false;
