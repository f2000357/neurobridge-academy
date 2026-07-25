// Seed the content index with a REAL, verified slice: NJ Grade-3 math, harvested
// from IXL's own published standards-alignment page (ixl.com/standards/
// new-jersey/math/grade-3) This is exactly the
// shape the daily crawler produces — it just does every standard/grade/subject.
//
//   node prisma/seed-index.mjs

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const IXL = "https://www.ixl.com";
const ixl = (slug) => `${IXL}${slug}`;
const ixlVideo = (slug) => `${IXL}${slug}?showVideoDirectly=true`;

// [standardCode, skillName, slug, ixlSkillCode]
const IXL_G3_MATH = [
  ["3.OA.A.2", "Divide by counting equal groups", "/math/grade-3/divide-by-counting-equal-groups", "3-V.1"],
  ["3.OA.A.2", "Write division sentences for groups", "/math/grade-3/write-division-sentences-for-groups", "3-V.2"],
  ["3.OA.A.4", "Multiplication facts for 2, 3, 4, 5, and 10: find the missing factor", "/math/grade-3/multiplication-facts-for-2-3-4-5-and-10-find-the-missing-factor", "3-P.4"],
  ["3.OA.A.4", "Multiplication facts for 6, 7, 8, and 9: find the missing factor", "/math/grade-3/multiplication-facts-for-6-7-8-and-9-find-the-missing-factor", "3-P.8"],
  ["3.OA.B.5", "Properties of multiplication", "/math/grade-3/properties-of-multiplication", "3-S.1"],
  ["3.OA.B.6", "Relate multiplication and division for groups", "/math/grade-3/relate-multiplication-and-division-for-groups", "3-V.4"],
  ["3.OA.D.8", "Two-step addition and subtraction word problems", "/math/grade-3/two-step-addition-and-subtraction-word-problems", "3-DD.1"],
  ["3.OA.D.8", "Two-step multiplication and division word problems", "/math/grade-3/two-step-multiplication-and-division-word-problems", "3-DD.2"],
  ["3.OA.D.9", "Addition patterns over increasing place values", "/math/grade-3/addition-patterns-over-increasing-place-values", "3-I.1"],
  ["3.NBT.A.1", "Round to the nearest ten or hundred using a number line", "/math/grade-3/round-to-the-nearest-ten-or-hundred-using-a-number-line", "3-C.1"],
  ["3.NBT.A.1", "Round to the nearest ten or hundred", "/math/grade-3/round-to-the-nearest-ten-or-hundred", "3-C.2"],
  ["3.NBT.A.3", "Multiply by a multiple of ten using place value", "/math/grade-3/multiply-by-a-multiple-of-ten-using-place-value", "3-U.1"],
];

async function main() {
  let n = 0;
  for (const [standardCode, skillName, slug, code] of IXL_G3_MATH) {
    await prisma.contentItem.upsert({
      where: { provider_standardCode_practiceUrl: { provider: "ixl", standardCode, practiceUrl: ixl(slug) } },
      update: { skillName, skillCode: code, videoUrl: ixlVideo(slug), active: true },
      create: {
        provider: "ixl", framework: "NJ", standardCode, subject: "math", gradeLevel: "3",
        skillName, skillCode: code, videoUrl: ixlVideo(slug), practiceUrl: ixl(slug),
      },
    });
    n++;
  }
  const total = await prisma.contentItem.count();
  console.log(`Seeded ${n} items. Index now holds ${total} content items (NJ Grade-3 math slice).`);
  await prisma.$disconnect();
}

main();
