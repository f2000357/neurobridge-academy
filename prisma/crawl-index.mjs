// The content-index crawler. Harvests the PROVIDER'S OWN published standards-
// alignment pages (public catalog data — not student data) and upserts the
// standard → skill → deep-link rows the app uses.
//
//   node prisma/crawl-index.mjs          # crawl the default scope, write to db
//   DRY=1 node prisma/crawl-index.mjs    # parse + report only, no writes
//   GRADES=3,4,5 node prisma/crawl-index.mjs
//
// Guardrails (please keep these):
//  - robots.txt checked: IXL allows /standards/ and skill pages (blocks only
//    /practice/*, /signin/* etc.). This crawler only touches allowed paths.
//  - Rate limited (DELAY_MS between fetches) and single-threaded — be a polite
//    guest, never a load.
//  - Public catalog only. Never student data, never behind a login.
//  - This is a prototype scope. Review the provider's Terms of Service before
//    running broadly / in production, and prefer an official feed/partnership
//    if one becomes available.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DRY = process.env.DRY === "1";
const DELAY_MS = Number(process.env.DELAY_MS || 3000);
const UA = "NeuroBridgeAcademy-IndexBot/0.1 (+standards alignment; contact: hello@neurobridge.co)";

// Scope: which alignment pages to crawl. Math is a clean 1:1 to our "math" lane;
// ELA/science need per-skill lane mapping, so they're left for a later pass.
const STATE = { framework: "NJ", slug: "new-jersey" };
const GRADES = (process.env.GRADES || "3").split(",").map((g) => g.trim()).filter(Boolean);
const SUBJECT = { urlSubject: "math", lane: "math" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parse(html, urlSubject, gradeSlug) {
  const stdRe = /[0-9]\.[A-Z]{1,3}\.[A-Z]\.[0-9]+/g;
  const stds = [];
  let m;
  while ((m = stdRe.exec(html))) stds.push({ pos: m.index, code: m[0] });
  const esc = `/${urlSubject}/${gradeSlug}/`;
  const skRe = new RegExp(
    `href="(${esc.replace(/[/]/g, "\\/")}[a-z0-9-]+)"[^>]*>\\s*<span class=.standard-skill-name.>([^<]+)<\\/span>.*?<span class=.standard-skill-code.>([^<]+)<\\/span>`,
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

async function crawlPage(gradeSlug, grade) {
  const url = `https://www.ixl.com/standards/${STATE.slug}/${SUBJECT.urlSubject}/${gradeSlug}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const html = await res.text();
  const rows = parse(html, SUBJECT.urlSubject, gradeSlug).filter((r) => r.standardCode);

  let wrote = 0;
  for (const r of rows) {
    const practiceUrl = `https://www.ixl.com${r.href}`;
    const videoUrl = `${practiceUrl}?showVideoDirectly=true`;
    if (DRY) continue;
    await prisma.contentItem.upsert({
      where: { provider_standardCode_practiceUrl: { provider: "ixl", standardCode: r.standardCode, practiceUrl } },
      update: { skillName: r.name, skillCode: r.code, videoUrl, active: true },
      create: {
        provider: "ixl",
        framework: STATE.framework,
        standardCode: r.standardCode,
        subject: SUBJECT.lane,
        gradeLevel: grade,
        skillName: r.name,
        skillCode: r.code,
        videoUrl,
        practiceUrl,
      },
    });
    wrote++;
  }
  return { url, parsed: rows.length, wrote };
}

async function main() {
  console.log(`Crawling IXL ${STATE.framework} ${SUBJECT.urlSubject}, grades ${GRADES.join(",")}${DRY ? " (dry run)" : ""}`);
  let total = 0;
  for (let i = 0; i < GRADES.length; i++) {
    const grade = GRADES[i];
    const gradeSlug = `grade-${grade}`;
    try {
      const r = await crawlPage(gradeSlug, grade);
      total += r.wrote;
      console.log(`  ${r.url} → parsed ${r.parsed}, ${DRY ? "would write" : "wrote"} ${DRY ? r.parsed : r.wrote}`);
    } catch (e) {
      console.log(`  grade ${grade}: ${e.message}`);
    }
    if (i < GRADES.length - 1) await sleep(DELAY_MS); // polite gap between pages
  }
  const count = await prisma.contentItem.count();
  console.log(`Done. ${DRY ? "(dry run — no writes)" : `Wrote ${total} items.`} Index now holds ${count} items.`);
  await prisma.$disconnect();
}

main();
