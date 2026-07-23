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

// Seeded ids (from the dev database).
const GAYATHRI = "cmrv18zru00003w3bqdbo33vp"; // guide of Meera
const MEERA = "cmrv18zrw00053w3b484lsd28"; //   Gayathri's learner (own)
const PRITHVI = "cmrv18zrv00023w3be4p9svkj"; //  Ms. Pierce's learner (foreign)

let pass = 0;
let fail = 0;

async function call(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return res.status;
}

// Attacker = Gayathri's cookie, acting on Prithvi (not hers) → must be 403.
async function denies(name, path, body) {
  const status = await call(path, body, `nb_user=${GAYATHRI}`);
  const ok = status === 403;
  console.log(`${ok ? "  ok " : "FAIL"}  ${name.padEnd(34)} cross-tenant → ${status}${ok ? "" : "  (expected 403)"}`);
  ok ? pass++ : fail++;
}

// Same tenant (Gayathri on Meera) → must NOT be 403.
async function allows(name, path, body) {
  const status = await call(path, body, `nb_user=${GAYATHRI}`);
  const ok = status !== 403;
  console.log(`${ok ? "  ok " : "FAIL"}  ${name.padEnd(34)} own-tenant   → ${status}${ok ? "" : "  (unexpected 403)"}`);
  ok ? pass++ : fail++;
}

async function main() {
  console.log(`\nAuthorization boundary · ${BASE}\n`);

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
