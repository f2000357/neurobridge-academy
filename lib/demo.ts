// The passwordless account "Switch" is a demo/dev convenience: it lets you enter
// any operator account without a password. That is fine locally, and it is what
// makes a hosted demo easy to walk through — but on a real deployment holding
// real children's data it would be an open door.
//
// So it is OPT-IN per deployment:
//   • local dev (NODE_ENV !== production) → always on
//   • hosted                              → only when DEMO_SWITCH=1 is set
//
// Turning a demo host back into a real one is an env-var change, not a code
// change: unset DEMO_SWITCH and the switch disappears, leaving /login as the
// only door.
export const switchEnabled =
  process.env.NODE_ENV !== "production" || process.env.DEMO_SWITCH === "1";

/** True when the passwordless switch is live on a hosted (production) build. */
export const demoSwitchOnHostedBuild =
  process.env.NODE_ENV === "production" && process.env.DEMO_SWITCH === "1";
