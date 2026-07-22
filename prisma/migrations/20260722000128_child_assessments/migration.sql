-- AlterTable
ALTER TABLE "Child" ADD COLUMN "age" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChildProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "readingLevel" TEXT NOT NULL DEFAULT 'grade-3',
    "mathLevel" TEXT NOT NULL DEFAULT '',
    "sentenceStyle" TEXT NOT NULL DEFAULT 'short',
    "literalLanguage" BOOLEAN NOT NULL DEFAULT true,
    "interests" TEXT NOT NULL DEFAULT '',
    "iepNotes" TEXT NOT NULL DEFAULT '',
    "mapTerm" TEXT NOT NULL DEFAULT '',
    "mapReadingRit" INTEGER,
    "mapMathRit" INTEGER,
    "mapLanguageRit" INTEGER,
    "calmView" BOOLEAN NOT NULL DEFAULT false,
    "textScale" REAL NOT NULL DEFAULT 1.0,
    "soundOn" BOOLEAN NOT NULL DEFAULT true,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "groundingStyle" TEXT NOT NULL DEFAULT 'standard',
    "timerStyle" TEXT NOT NULL DEFAULT 'bar',
    "transitionWarnMin" INTEGER NOT NULL DEFAULT 2,
    "firstThenVisible" BOOLEAN NOT NULL DEFAULT true,
    "pacing" TEXT NOT NULL DEFAULT 'gentle',
    "practiceBatch" INTEGER NOT NULL DEFAULT 1,
    "frustrationPlan" TEXT NOT NULL DEFAULT 'offer-break',
    "neverDo" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ChildProfile_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ChildProfile" ("calmView", "childId", "firstThenVisible", "frustrationPlan", "groundingStyle", "id", "interests", "literalLanguage", "neverDo", "pacing", "practiceBatch", "readingLevel", "reducedMotion", "sentenceStyle", "soundOn", "textScale", "timerStyle", "transitionWarnMin") SELECT "calmView", "childId", "firstThenVisible", "frustrationPlan", "groundingStyle", "id", "interests", "literalLanguage", "neverDo", "pacing", "practiceBatch", "readingLevel", "reducedMotion", "sentenceStyle", "soundOn", "textScale", "timerStyle", "transitionWarnMin" FROM "ChildProfile";
DROP TABLE "ChildProfile";
ALTER TABLE "new_ChildProfile" RENAME TO "ChildProfile";
CREATE UNIQUE INDEX "ChildProfile_childId_key" ON "ChildProfile"("childId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
