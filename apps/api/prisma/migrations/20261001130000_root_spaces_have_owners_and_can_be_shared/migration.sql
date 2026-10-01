-- ADR 26: each person has an inventory, and the administrator shares it.
--
-- Ownership is written on ROOT spaces only. Everything below a root belongs to
-- the root's owner through the tree, so moving a subtree carries its ownership
-- along with no extra writes, and there is exactly one place it is recorded.
--
-- Written so that the day of the deploy changes nothing anybody can see: the
-- oldest account — the administrator the previous migration made — owns every
-- root that exists, and every other account is given an edit share on each of
-- them. The previous migration has already refused a database with spaces and
-- no account, so there is always somebody to own them here.

-- `ADD COLUMN`, not a rebuild: rebuilding `StorageUnit` would drop the three
-- search triggers that hang off it (ADR 11). A foreign key may be added this
-- way because the column's default is NULL. `Restrict`, because an account
-- owning an inventory is never deleted (accounts are disabled, ADR 26), and a
-- root left with nobody would break the invariant below.
ALTER TABLE "StorageUnit" ADD COLUMN "ownerId" TEXT
  CONSTRAINT "StorageUnit_ownerId_fkey" REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "StorageUnit"
SET "ownerId" = (
  SELECT "id" FROM "User" WHERE "role" = 'administrator'
  ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
)
WHERE "parentId" IS NULL;

CREATE INDEX "StorageUnit_ownerId_idx" ON "StorageUnit"("ownerId");

-- The invariant, kept by the database: a root has an owner and a space inside
-- another has none. SQLite cannot add a CHECK constraint without rebuilding the
-- table (and losing the search triggers), so it is two triggers that refuse
-- the write, the way the search index is kept by triggers rather than by
-- application code that has to remember.
CREATE TRIGGER "StorageUnit_owner_on_root_only_insert"
BEFORE INSERT ON "StorageUnit"
WHEN (NEW."parentId" IS NULL) <> (NEW."ownerId" IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'A root space has an owner and a space inside another has none (ADR 26)');
END;

CREATE TRIGGER "StorageUnit_owner_on_root_only_update"
BEFORE UPDATE OF "parentId", "ownerId" ON "StorageUnit"
WHEN (NEW."parentId" IS NULL) <> (NEW."ownerId" IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'A root space has an owner and a space inside another has none (ADR 26)');
END;

-- A space shared with one person, at one level, covering everything under it.
-- One row per (space, person): two levels for the same pair would be a
-- question with two answers. `Cascade` on both sides: a share is a grant, not
-- inventory, and a grant on a space or for a person that is gone means nothing.
CREATE TABLE "Share" (
    "storageUnitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "access" TEXT NOT NULL,

    PRIMARY KEY ("storageUnitId", "userId"),
    CONSTRAINT "Share_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Share_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Share_userId_idx" ON "Share"("userId");

-- Everybody but the administrator keeps seeing everything they saw yesterday.
INSERT INTO "Share" ("storageUnitId", "userId", "access")
SELECT "StorageUnit"."id", "User"."id", 'edit'
FROM "StorageUnit", "User"
WHERE "StorageUnit"."parentId" IS NULL
  AND "User"."role" <> 'administrator';
