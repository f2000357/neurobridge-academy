// One-time migration: copy every row from the local Postgres database into the
// hosted one (Supabase). Table order is derived from Prisma's own relation graph
// (topological sort), so foreign keys are always satisfied — no need to disable
// triggers or guess an order by hand.
//
//   FROM_URL=postgresql://... TO_URL=postgresql://... node prisma/copy-to-supabase.mjs
//   ...add DRY=1 to report what WOULD be copied without writing.
//
// Re-runnable: rows that already exist are skipped, so a partial run can be
// resumed safely.

import { PrismaClient, Prisma } from "@prisma/client";

const FROM = process.env.FROM_URL;
const TO = process.env.TO_URL;
const DRY = process.env.DRY === "1";
const BATCH = 500;

if (!FROM || !TO) {
  console.error("Set FROM_URL and TO_URL.");
  process.exit(1);
}
if (FROM === TO) {
  console.error("FROM_URL and TO_URL are the same database — refusing to run.");
  process.exit(1);
}

const src = new PrismaClient({ datasourceUrl: FROM });
const dst = new PrismaClient({ datasourceUrl: TO });

// Model name -> the models it points at via a foreign key it owns.
function dependencyGraph() {
  const models = Prisma.dmmf.datamodel.models;
  const deps = new Map();
  for (const m of models) {
    const set = new Set();
    for (const f of m.fields) {
      // Only relations where THIS model holds the FK column create an ordering
      // requirement. Ignore self-references — they can't be satisfied by order.
      if (f.kind === "object" && f.relationFromFields?.length && f.type !== m.name) {
        set.add(f.type);
      }
    }
    deps.set(m.name, set);
  }
  return deps;
}

/** Models ordered so every model comes after the ones it depends on. */
function topoSort() {
  const deps = dependencyGraph();
  const done = new Set();
  const order = [];
  let guard = 0;
  while (order.length < deps.size && guard++ < 1000) {
    for (const [model, need] of deps) {
      if (done.has(model)) continue;
      if ([...need].every((d) => done.has(d))) {
        done.add(model);
        order.push(model);
      }
    }
  }
  // Anything left is part of a cycle — append it and hope the FK is nullable.
  for (const model of deps.keys()) if (!done.has(model)) order.push(model);
  return order;
}

// The Prisma client property for a model ("ChildProfile" -> "childProfile").
const clientKey = (name) => name.charAt(0).toLowerCase() + name.slice(1);

async function main() {
  const order = topoSort();
  console.log(`Copying ${order.length} models${DRY ? " (dry run)" : ""}\n`);

  let grandTotal = 0;
  const report = [];
  for (const model of order) {
    const key = clientKey(model);
    if (!src[key] || !dst[key]) {
      console.log(`  ${model}: (not a queryable model, skipped)`);
      continue;
    }
    const rows = await src[key].findMany();
    if (rows.length === 0) continue;

    if (DRY) {
      report.push(`  ${model}: would copy ${rows.length}`);
      grandTotal += rows.length;
      continue;
    }

    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const res = await dst[key].createMany({ data: chunk, skipDuplicates: true });
      written += res.count;
    }
    grandTotal += written;
    const skipped = rows.length - written;
    report.push(`  ${model}: ${written}${skipped ? ` (${skipped} already there)` : ""}`);
  }

  console.log(report.join("\n"));
  console.log(`\n${DRY ? "Would copy" : "Copied"} ${grandTotal} rows.`);

  if (!DRY) {
    // Verify: compare row counts on both sides.
    console.log("\nVerifying…");
    const mismatches = [];
    for (const model of order) {
      const key = clientKey(model);
      if (!src[key] || !dst[key]) continue;
      const [a, b] = await Promise.all([src[key].count(), dst[key].count()]);
      if (a !== b) mismatches.push(`  ${model}: local ${a} vs hosted ${b}`);
    }
    console.log(mismatches.length ? `MISMATCHES:\n${mismatches.join("\n")}` : "  every table matches ✓");
  }

  await src.$disconnect();
  await dst.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e.message);
  await src.$disconnect().catch(() => {});
  await dst.$disconnect().catch(() => {});
  process.exit(1);
});
