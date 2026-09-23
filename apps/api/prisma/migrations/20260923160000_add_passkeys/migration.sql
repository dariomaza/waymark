-- ADR 19: a passkey is an additional door, never a replacement.
--
-- Three changes, and the first one is the only destructive-looking one: the
-- `Session` table is rebuilt to gain `createdWith`, because SQLite cannot add
-- a NOT NULL column without a default and a default here would be the wrong
-- way round — a session that forgot to say how it was opened would silently
-- claim the PERMISSIVE value, which is the one that may register a passkey.
-- Every session that exists today was opened with a password, so that is what
-- they are written as, once, here.

CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdWith" TEXT NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Session" ("id", "tokenHash", "userId", "createdAt", "expiresAt", "createdWith")
SELECT "id", "tokenHash", "userId", "createdAt", "expiresAt", 'password' FROM "Session";

DROP TABLE "Session";

ALTER TABLE "new_Session" RENAME TO "Session";

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "signCount" INTEGER NOT NULL,
    "transports" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateTable
CREATE TABLE "PasskeyChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ceremony" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "PasskeyChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON "PasskeyChallenge"("expiresAt");
