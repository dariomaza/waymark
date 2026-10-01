-- ADR 26: every account has a role, and a machine token belongs to the person
-- who issued it.
--
-- Written so that the day of the deploy changes nothing anybody can see: the
-- oldest account becomes the administrator, and every machine token that
-- already exists becomes theirs.

-- A machine token that exists while no account does has nobody to belong to.
-- Leaving it ownerless would ship a credential that acts as nobody, and
-- inventing an account is not something a migration may do. So the migration
-- refuses, FIRST, before it has changed anything, and says how to get past it.
-- SQLite only raises an error from inside a trigger, hence the throwaway one.
CREATE TEMP TABLE "_AccountsMigrationGuard" ("checked" INTEGER);

CREATE TEMP TRIGGER "_AccountsMigrationGuard_tokens"
BEFORE INSERT ON "_AccountsMigrationGuard"
WHEN NOT EXISTS (SELECT 1 FROM main."User") AND EXISTS (SELECT 1 FROM main."MachineToken")
BEGIN
  SELECT RAISE(ABORT, 'Machine tokens exist but no account does, so nobody can own them (ADR 26). Run `prisma migrate resolve --rolled-back 20261001120000_each_person_has_a_role_and_owns_their_machine_tokens`, create the first account with create-user on the previous release, and deploy again.');
END;

INSERT INTO "_AccountsMigrationGuard" ("checked") VALUES (1);

DROP TABLE "_AccountsMigrationGuard";

-- `user` by default, so an account that forgot to say what it is gets the
-- NARROWER role. Who becomes an administrator is always written on purpose.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- The oldest account. `id` breaks a tie, so the choice never depends on the
-- order SQLite happens to read the rows in.
UPDATE "User" SET "role" = 'administrator'
WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);

-- `MachineToken` is rebuilt to gain a NOT NULL `userId`: SQLite cannot add a
-- NOT NULL column without a default, and there is no honest default for whose
-- credential this is.
CREATE TABLE "new_MachineToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    CONSTRAINT "MachineToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_MachineToken" ("id", "name", "tokenHash", "scope", "userId", "createdAt", "expiresAt", "lastUsedAt")
SELECT "id", "name", "tokenHash", "scope",
       (SELECT "id" FROM "User" WHERE "role" = 'administrator' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1),
       "createdAt", "expiresAt", "lastUsedAt"
FROM "MachineToken";

DROP TABLE "MachineToken";

ALTER TABLE "new_MachineToken" RENAME TO "MachineToken";

CREATE UNIQUE INDEX "MachineToken_name_key" ON "MachineToken"("name");

CREATE UNIQUE INDEX "MachineToken_tokenHash_key" ON "MachineToken"("tokenHash");

CREATE INDEX "MachineToken_expiresAt_idx" ON "MachineToken"("expiresAt");

CREATE INDEX "MachineToken_userId_idx" ON "MachineToken"("userId");
