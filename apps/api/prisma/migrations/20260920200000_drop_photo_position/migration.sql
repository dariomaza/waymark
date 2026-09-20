-- ADR 9: photo ordering is owned by the item that references the photo.
-- `ItemPhoto.position` is the only place an order is written or read, so the
-- duplicate on `Photo` is dropped rather than kept in sync with nothing.
CREATE TABLE "new_Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalPath" TEXT NOT NULL,
    "processedPath" TEXT,
    "processingStatus" TEXT NOT NULL
);

INSERT INTO "new_Photo" ("id", "originalPath", "processedPath", "processingStatus")
SELECT "id", "originalPath", "processedPath", "processingStatus" FROM "Photo";

DROP TABLE "Photo";

ALTER TABLE "new_Photo" RENAME TO "Photo";

CREATE INDEX "Photo_processingStatus_idx" ON "Photo"("processingStatus");
