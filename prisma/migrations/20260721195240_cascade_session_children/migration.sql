-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvalSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EvalSignal" ("chunkIndex", "createdAt", "id", "kind", "payload", "sessionId") SELECT "chunkIndex", "createdAt", "id", "kind", "payload", "sessionId" FROM "EvalSignal";
DROP TABLE "EvalSignal";
ALTER TABLE "new_EvalSignal" RENAME TO "EvalSignal";
CREATE TABLE "new_ProgressNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "workedWell" TEXT NOT NULL DEFAULT '',
    "stuckOn" TEXT NOT NULL DEFAULT '',
    "nextStep" TEXT NOT NULL DEFAULT '',
    "teacherNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProgressNote" ("createdAt", "id", "nextStep", "sessionId", "stuckOn", "teacherNotes", "workedWell") SELECT "createdAt", "id", "nextStep", "sessionId", "stuckOn", "teacherNotes", "workedWell" FROM "ProgressNote";
DROP TABLE "ProgressNote";
ALTER TABLE "new_ProgressNote" RENAME TO "ProgressNote";
CREATE UNIQUE INDEX "ProgressNote_sessionId_key" ON "ProgressNote"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
