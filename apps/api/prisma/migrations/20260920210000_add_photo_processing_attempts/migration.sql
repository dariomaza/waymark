-- Retry bookkeeping for background removal (ADR 4).
--
-- Not a queue: the queue is `Photo.processingStatus = 'PENDING'`. This table
-- only carries what that column cannot -- attempts so far, when the next one is
-- due, who holds the photo right now, and why it was given up on.
CREATE TABLE "PhotoProcessingAttempt" (
    "photoId" TEXT NOT NULL PRIMARY KEY,
    "attempts" INTEGER NOT NULL,
    "nextAttemptAt" DATETIME NOT NULL,
    "leaseExpiresAt" DATETIME,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "PhotoProcessingAttempt_nextAttemptAt_idx" ON "PhotoProcessingAttempt"("nextAttemptAt");
