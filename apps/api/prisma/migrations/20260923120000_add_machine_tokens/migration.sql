-- CreateTable
CREATE TABLE "MachineToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "MachineToken_name_key" ON "MachineToken"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MachineToken_tokenHash_key" ON "MachineToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MachineToken_expiresAt_idx" ON "MachineToken"("expiresAt");
