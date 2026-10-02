-- ADR 26: a machine token may be narrowed to chosen spaces, never widened.
--
-- "Narrowed" is a column of its own rather than "the token has rows below".
-- The rows go with a deleted space (they cascade, like a share), and a token
-- whose chosen spaces have all been deleted must reach nothing; were the fact
-- inferred from the rows, the last delete would silently widen it to its
-- issuer's whole reach.
--
-- `ADD COLUMN` with a constant default, not a rebuild: every existing token
-- was issued with no spaces chosen, which is what `false` means.
ALTER TABLE "MachineToken" ADD COLUMN "narrowed" BOOLEAN NOT NULL DEFAULT false;

-- One row per (token, space). `Cascade` on both sides: a grant on a token or
-- a space that is gone means nothing, and ADR 3's refusal of destructive
-- cascades is about inventory, not grants.
CREATE TABLE "MachineTokenSpace" (
    "machineTokenId" TEXT NOT NULL,
    "storageUnitId" TEXT NOT NULL,

    PRIMARY KEY ("machineTokenId", "storageUnitId"),
    CONSTRAINT "MachineTokenSpace_machineTokenId_fkey" FOREIGN KEY ("machineTokenId") REFERENCES "MachineToken" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MachineTokenSpace_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MachineTokenSpace_storageUnitId_idx" ON "MachineTokenSpace"("storageUnitId");
