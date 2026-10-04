-- ADR 26, amended: a password an administrator generates is temporary, and
-- the person must choose their own the first time they sign in.
--
-- Every account that exists today chose or was given a password the old way,
-- so it is not asked to change it: the default is false.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
