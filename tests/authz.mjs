// Authorization-boundary smoke test.
//
// Runs against a live dev server (default http://localhost:3000). It confirms
// the cross-tenant boundary: an operator resolved as guide A cannot act on
// guide B's learner, on every route that takes a childId. All cross-tenant
// calls must 403 (which also means no mutation ran). A couple of same-tenant
// reads confirm the guard doesn't over-block.
//
//   node tests/authz.mjs            # expects the dev server on :3000

const BASE = process.env.BASE ?? "http://localhost:3000";

// Seeded dev credentials + ids.
const GUIDE_EMAIL = "gayathri@dev.neurable"; // guide of Meera
const GUIDE_PASSWORD = "neurable-dev";
const MEERA = "cmrv18zrw00053w3b484lsd28"; //  the guide's learner (own)
const PRITHVI = "cmrv18zrv00023w3be4p9svkj"; // Ms. Pierce's learner (foreign)

let pass = 0;
let fail = 0;
let sessionCookie = "";

// Sign in for real and capture the signed session cookie (the old raw-id cookie
// is now ignored, so the test must authenticate like a browser does).
async function login() {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "login", email: GUIDE_EMAIL, password: GUIDE_PASSWORD }),
  });
  const raw = res.headers.get("set-cookie") ?? "";
  sessionCookie = raw.split(";")[0]; // "nb_session=<token>"
  if (res.status !== 200 || !sessionCookie.startsWith("nb_session=")) {
    throw new Error(`login failed (${res.status}) — run: node prisma/seed-passwords.mjs`);
  }
}

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify(body),
  });
  return res.status;
}

// Signed in as the guide, acting on Prithvi (not hers) → must be 403.
async function denies(name, path, body) {
  const status = await call(path, body);
  const ok = status === 403;
  console.log(`${ok ? "  ok " : "FAIL"}  ${name.padEnd(34)} cross-tenant → ${status}${ok ? "" : "  (expected 403)"}`);
  ok ? pass++ : fail++;
}

// Same tenant (the guide on Meera) → must NOT be 403.
async function allows(name, path, body) {
  const status = await call(path, body);
  const ok = status !== 403;
  console.log(`${ok ? "  ok " : "FAIL"}  ${name.padEnd(34)} own-tenant   → ${status}${ok ? "" : "  (unexpected 403)"}`);
  ok ? pass++ : fail++;
}

async function main() {
  console.log(`\nAuthorization boundary · ${BASE}\n`);
  await login();

  // --- cross-tenant: every childId route must refuse Prithvi ---
  await denies("schedule.list", "/api/schedule", { op: "list", childId: PRITHVI, date: "2026-07-23" });
  await denies("schedule.add", "/api/schedule", { op: "add", childId: PRITHVI, date: "2026-07-23", kind: "break", startMin: 540, endMin: 570 });
  await denies("child.save", "/api/child", { op: "save", childId: PRITHVI, name: "Hacked" });
  await denies("child.regenerateCode", "/api/child", { op: "regenerateCode", childId: PRITHVI });
  await denies("child.setInterests", "/api/child", { op: "setInterests", childId: PRITHVI, interests: [] });
  await denies("rewards.redeem", "/api/rewards", { op: "redeem", childId: PRITHVI, rewardId: "x" });
  await denies("session.award", "/api/session", { op: "award", childId: PRITHVI, points: 5 });
  await denies("test.generate", "/api/test", { op: "generate", childId: PRITHVI });
  await denies("tutor.teach", "/api/tutor", { op: "teach", childId: PRITHVI, chunk: { type: "read_text", title: "x" }, lessonTitle: "x", goal: "x" });
  await denies("weekplan.generate", "/api/weekplan", { op: "generate", childId: PRITHVI, weekStart: "2026-07-20" });
  await denies("specialists.assign", "/api/specialists", { op: "assign", teacherId: "x", childId: PRITHVI });

  // --- same tenant: the guard must not block Gayathri on her own learner ---
  await allows("schedule.list", "/api/schedule", { op: "list", childId: MEERA, date: "2026-07-23" });

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
