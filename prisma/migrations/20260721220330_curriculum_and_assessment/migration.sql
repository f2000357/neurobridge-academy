-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LessonPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "childId" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "standardCode" TEXT NOT NULL DEFAULT '',
    "standardText" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL DEFAULT '',
    "chunks" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 25,
    "renderer" TEXT NOT NULL DEFAULT 'web',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LessonPlan_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LessonPlan" ("childId", "chunks", "createdAt", "durationMin", "goal", "id", "published", "renderer", "subject", "teacherId", "title", "updatedAt", "whyItMatters") SELECT "childId", "chunks", "createdAt", "durationMin", "goal", "id", "published", "renderer", "subject", "teacherId", "title", "updatedAt", "whyItMatters" FROM "LessonPlan";
DROP TABLE "LessonPlan";
ALTER TABLE "new_LessonPlan" RENAME TO "LessonPlan";
CREATE TABLE "new_ProgressNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "workedWell" TEXT NOT NULL DEFAULT '',
    "stuckOn" TEXT NOT NULL DEFAULT '',
    "nextStep" TEXT NOT NULL DEFAULT '',
    "teacherNotes" TEXT NOT NULL DEFAULT '',
    "score" INTEGER,
    "masteryLevel" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProgressNote" ("createdAt", "id", "nextStep", "sessionId", "stuckOn", "teacherNotes", "workedWell") SELECT "createdAt", "id", "nextStep", "sessionId", "stuckOn", "teacherNotes", "workedWell" FROM "ProgressNote";
DROP TABLE "ProgressNote";
ALTER TABLE "new_ProgressNote" RENAME TO "ProgressNote";
CREATE UNIQUE INDEX "ProgressNote_sessionId_key" ON "ProgressNote"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
