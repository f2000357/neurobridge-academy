-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyPlan_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "focus" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "topic" TEXT NOT NULL DEFAULT '',
    "standardCode" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lessonPlanId" TEXT,
    CONSTRAINT "WeeklyLesson_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_childId_weekStart_key" ON "WeeklyPlan"("childId", "weekStart");
