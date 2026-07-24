// The content-index crawler. Harvests the PROVIDER'S OWN published standards-
// alignment pages (public catalog data — not student data) and upserts the
// standard → skill → deep-link rows the app uses.
//
//   node prisma/crawl-index.mjs                     # default scope, write to db
//   DRY=1 node prisma/crawl-index.mjs               # parse + report only
//   GRADES=3,4,5 SUBJECTS=math,ela,science node prisma/crawl-index.mjs
//
// Guardrails (please keep these):
//  - robots.txt checked: IXL allows /standards/ and skill pages (blocks only
//    /practice/*, /signin/* etc.). This crawler only touches allowed paths.
//  - Rate limited (DELAY_MS between fetches) and single-threaded — a polite
//    guest, never a load.
//  - Public catalog only. Never student data, never behind a login.
//  - Prototype scope. Review the provider's Terms of Service before running
//    broadly / in production, and prefer an official feed if one appears.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DRY = process.env.DRY === "1";
const DELAY_MS = Number(process.env.DELAY_MS || 3000);
const UA = "NeuroBridgeAcademy-IndexBot/0.1 (+standards alignment; contact: hello@neurobridge.co)";

const STATE = { framework: "NJ", slug: "new-jersey" };
const GRADES = (process.env.GRADES || "3").split(",").map((g) => g.trim()).filter(Boolean);

// ELA maps to our reading/writing lanes by the standard's STRAND. NJ 2023 codes
// look like "L.RF.3.3" (a leading L. prefix), so the strand is the last
// alphabetic segment before the numbers (RF, WF, KL, VL, VI…). W/L/K = writing
// (composition, language knowledge, conventions); R/V/S = reading (reading,
// vocabulary, speaking).
function elaLane(code) {
  const alpha = code.split(".").filter((s) => /^[A-Z]+$/.test(s));
  const strand = alpha[alpha.length - 1] || "";
  return ["W", "L", "K"].includes(strand[0]) ? "writing" : "reading";
}

// Each subject: its alignment URL segment, its standard-code shape, and how a
// code becomes one of our lanes.
const SUBJECTS = {
  math: { urlSubject: "math", codeSrc: "[0-9]\\.[A-Z]{1,3}\\.(?:[A-Z]\\.)?[0-9]+", lane: () => "math" },
  ela: { urlSubject: "ela", codeSrc: "[A-Z]{1,3}(?:\\.[A-Z]{1,3})?\\.[0-9]{1,2}\\.[0-9]{1,2}[a-z]?", lane: elaLane },
  science: { urlSubject: "science", codeSrc: "[0-9]-[A-Z]{2,4}[0-9]?-[0-9]+", lane: () => "science" },
};
const PICKED = (process.env.SUBJECTS || "math,ela,science").split(",").map((s) => s.trim()).filter((s) => SUBJECTS[s]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parse(html, subj, gradeSlug) {
  const stds = [];
  const stdRe = new RegExp(subj.codeSrc, "g");
  let m;
  while ((m = stdRe.exec(html))) stds.push({ pos: m.index, code: m[0] });
  const hrefEsc = `/${subj.urlSubject}/${gradeSlug}/`.replace(/[/]/g, "\\/");
  const skRe = new RegExp(
    `href="(${hrefEsc}[a-z0-9-]+)"[^>]*>\\s*<span class=.standard-skill-name.>([^<]+)<\\/span>.*?<span class=.standard-skill-code.>([^<]+)<\\/span>`,
    "g"
  );
  const skills = [];
  while ((m = skRe.exec(html))) skills.push({ pos: m.index, href: m[1], name: m[2].trim(), code: m[3].trim() });
  const stdFor = (pos) => {
    let best = null;
    for (const s of stds) {
      if (s.pos < pos) best = s.code;
      else break;
    }
    return best;
  };
  return skills.map((s) => ({ standardCode: stdFor(s.pos), name: s.name, href: s.href, code: s.code }));
}

async function crawlPage(subjKey, gradeSlug, grade) {
  const subj = SUBJECTS[subjKey];
  const url = `https://www.ixl.com/standards/${STATE.slug}/${subj.urlSubject}/${gradeSlug}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const rows = parse(await res.text(), subj, gradeSlug).filter((r) => r.standardCode);

  let wrote = 0;
  for (const r of rows) {
    const practiceUrl = `https://www.ixl.com${r.href}`;
    if (DRY) continue;
    await prisma.contentItem.upsert({
      where: { provider_standardCode_practiceUrl: { provider: "ixl", standardCode: r.standardCode, practiceUrl } },
      update: { skillName: r.name, skillCode: r.code, subject: subj.lane(r.standardCode), videoUrl: `${practiceUrl}?showVideoDirectly=true`, active: true },
      create: {
        provider: "ixl",
        framework: STATE.framework,
        standardCode: r.standardCode,
        subject: subj.lane(r.standardCode),
        gradeLevel: grade,
        skillName: r.name,
        skillCode: r.code,
        videoUrl: `${practiceUrl}?showVideoDirectly=true`,
        practiceUrl,
      },
    });
    wrote++;
  }
  return { url, parsed: rows.length, wrote };
}

async function main() {
  console.log(`Crawling IXL ${STATE.framework} · subjects ${PICKED.join(",")} · grades ${GRADES.join(",")}${DRY ? " (dry run)" : ""}`);
  const jobs = [];
  for (const subjKey of PICKED) for (const grade of GRADES) jobs.push({ subjKey, grade });

  let total = 0;
  for (let i = 0; i < jobs.length; i++) {
    const { subjKey, grade } = jobs[i];
    try {
      const r = await crawlPage(subjKey, `grade-${grade}`, grade);
      total += r.wrote;
      console.log(`  ${r.url} → parsed ${r.parsed}, ${DRY ? "would write" : "wrote"} ${DRY ? r.parsed : r.wrote}`);
    } catch (e) {
      console.log(`  ${subjKey} grade ${grade}: ${e.message}`);
    }
    if (i < jobs.length - 1) await sleep(DELAY_MS);
  }

  if (!DRY) {
    const byLane = await prisma.contentItem.groupBy({ by: ["subject"], _count: true });
    console.log("Index by lane:", Object.fromEntries(byLane.map((b) => [b.subject, b._count])));
  }
  const count = await prisma.contentItem.count();
  console.log(`Done. ${DRY ? "(dry run — no writes)" : `Wrote ${total} items.`} Index now holds ${count} items.`);
  await prisma.$disconnect();
}

main();
