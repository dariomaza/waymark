-- CreateTable
CREATE TABLE "StorageUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "photoId" TEXT,
    "publicId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StorageUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorageUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storageUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_storageUnitId_fkey" FOREIGN KEY ("storageUnitId") REFERENCES "StorageUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemTag" (
    "itemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,

    PRIMARY KEY ("itemId", "position"),
    CONSTRAINT "ItemTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemPhoto" (
    "itemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "photoId" TEXT NOT NULL,

    PRIMARY KEY ("itemId", "position"),
    CONSTRAINT "ItemPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalPath" TEXT NOT NULL,
    "processedPath" TEXT,
    "processingStatus" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageUnit_publicId_key" ON "StorageUnit"("publicId");

-- CreateIndex
CREATE INDEX "StorageUnit_parentId_idx" ON "StorageUnit"("parentId");

-- CreateIndex
CREATE INDEX "StorageUnit_name_idx" ON "StorageUnit"("name");

-- CreateIndex
CREATE INDEX "Item_storageUnitId_idx" ON "Item"("storageUnitId");

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "Item"("name");

-- CreateIndex
CREATE INDEX "ItemTag_tag_idx" ON "ItemTag"("tag");

-- CreateIndex
CREATE INDEX "ItemPhoto_photoId_idx" ON "ItemPhoto"("photoId");

-- CreateIndex
CREATE INDEX "Photo_processingStatus_idx" ON "Photo"("processingStatus");
