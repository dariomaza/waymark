-- ADR 26: an administrator may disable an account, and accounts are never
-- deleted, because the row is what owns that person's inventory.
--
-- Nullable, with no default: every account that exists today is active, which
-- is what NULL means.
ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME;
