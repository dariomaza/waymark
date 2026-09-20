-- A thumbnail is written at upload, next to the original, so the column is
-- NOT NULL. There is no sensible default: the path is whatever the file store
-- actually wrote. Existing rows are backfilled from `originalPath` only so the
-- constraint can be added at all; no photo has ever been uploaded through this
-- service, because the upload endpoint arrives in the same change as this
-- column.
CREATE TABLE "new_Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalPath" TEXT NOT NULL,
    "thumbnailPath" TEXT NOT NULL,
    "processedPath" TEXT,
    "processingStatus" TEXT NOT NULL
);

INSERT INTO "new_Photo" ("id", "originalPath", "thumbnailPath", "processedPath", "processingStatus")
SELECT "id", "originalPath", "originalPath", "processedPath", "processingStatus" FROM "Photo";

DROP TABLE "Photo";

ALTER TABLE "new_Photo" RENAME TO "Photo";

CREATE INDEX "Photo_processingStatus_idx" ON "Photo"("processingStatus");
