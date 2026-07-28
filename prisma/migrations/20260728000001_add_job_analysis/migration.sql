CREATE TABLE "JobAnalysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT,
    "source" TEXT,
    "imageUrl" TEXT,
    "rawText" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "JobAnalysis_userId_createdAt_idx" ON "JobAnalysis"("userId", "createdAt");
