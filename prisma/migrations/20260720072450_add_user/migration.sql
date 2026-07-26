/*
  Warnings:

  - You are about to drop the `UserBenefit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `uploaderId` on the `Record` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "UserBenefit_uploaderId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserBenefit";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "identifier" TEXT NOT NULL,
    "membershipDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Record" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
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
    "city" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Record_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Record" ("actualPosition", "city", "companyId", "content", "createdAt", "id", "images", "isConsistentWithJD", "isReported", "rejectReason", "reportCount", "reportReason", "salaryRange", "status", "title", "type", "updatedAt", "workContent") SELECT "actualPosition", "city", "companyId", "content", "createdAt", "id", "images", "isConsistentWithJD", "isReported", "rejectReason", "reportCount", "reportReason", "salaryRange", "status", "title", "type", "updatedAt", "workContent" FROM "Record";
DROP TABLE "Record";
ALTER TABLE "new_Record" RENAME TO "Record";
CREATE INDEX "Record_companyId_idx" ON "Record"("companyId");
CREATE INDEX "Record_userId_idx" ON "Record"("userId");
CREATE INDEX "Record_status_idx" ON "Record"("status");
CREATE INDEX "Record_city_idx" ON "Record"("city");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_identifier_key" ON "User"("identifier");
