-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Record" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "actualPosition" TEXT,
    "salaryRange" TEXT,
    "workContent" TEXT,
    "isConsistentWithJD" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "reportReason" TEXT,
    "uploaderId" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Record_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Record" ("actualPosition", "companyId", "content", "createdAt", "id", "images", "isConsistentWithJD", "isReported", "rejectReason", "reportCount", "reportReason", "salaryRange", "status", "title", "type", "updatedAt", "uploaderId", "workContent") SELECT "actualPosition", "companyId", "content", "createdAt", "id", "images", "isConsistentWithJD", "isReported", "rejectReason", "reportCount", "reportReason", "salaryRange", "status", "title", "type", "updatedAt", "uploaderId", "workContent" FROM "Record";
DROP TABLE "Record";
ALTER TABLE "new_Record" RENAME TO "Record";
CREATE INDEX "Record_companyId_idx" ON "Record"("companyId");
CREATE INDEX "Record_status_idx" ON "Record"("status");
CREATE INDEX "Record_city_idx" ON "Record"("city");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
