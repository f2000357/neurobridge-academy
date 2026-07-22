-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "standardCode" TEXT NOT NULL DEFAULT '',
    "questions" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "score" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Homework_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProposedLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "standardCode" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'document',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lessonPlanId" TEXT,
    CONSTRAINT "ProposedLesson_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ProgramProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProposedLesson" ("grade", "id", "lessonPlanId", "proposalId", "rationale", "status", "subject", "title", "topic") SELECT "grade", "id", "lessonPlanId", "proposalId", "rationale", "status", "subject", "title", "topic" FROM "ProposedLesson";
DROP TABLE "ProposedLesson";
ALTER TABLE "new_ProposedLesson" RENAME TO "ProposedLesson";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
