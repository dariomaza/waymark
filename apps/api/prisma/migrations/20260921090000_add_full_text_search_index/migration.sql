-- Full-text search over the inventory (ADR 11).
--
-- Two FTS5 tables and the triggers that keep them honest. The triggers are
-- the whole point: they run inside the SAME transaction as the write that
-- fired them, so the index is a derivative of the base tables the way a
-- B-tree index is, not a second copy of the truth that application code has
-- to remember to update. A rename made by a use case, by a migration, or by
-- somebody with a SQL client at 2am all keep the index right.
--
-- `remove_diacritics 2` is what makes `camara` find `cámara` and `cámara`
-- find `camara`: the tokenizer folds the accents out of the stored text and
-- out of the query, so the comparison never sees one. The domain folds the
-- query with the same rule before it gets here.
--
-- `prefix = '2 3 4'` builds prefix indexes for two, three and four letters,
-- which is where search-as-you-type actually spends its time. A single
-- letter is left to scan; it matches nearly everything anyway.

CREATE VIRTUAL TABLE "ItemSearch" USING fts5(
  "itemId" UNINDEXED,
  "name",
  "tags",
  "description",
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3 4'
);

CREATE VIRTUAL TABLE "StorageUnitSearch" USING fts5(
  "unitId" UNINDEXED,
  "name",
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3 4'
);

-- An item's searchable text is spread over two tables, so it is rebuilt from
-- both whenever either changes. `ItemTag` rows are replaced wholesale on every
-- save (a save is a statement about the whole item, never a patch), which is
-- why the tag triggers recompute the column from scratch rather than trying
-- to append to it.

CREATE TRIGGER "Item_search_insert" AFTER INSERT ON "Item" BEGIN
  DELETE FROM "ItemSearch" WHERE "itemId" = new."id";
  INSERT INTO "ItemSearch" ("itemId", "name", "tags", "description")
  VALUES (
    new."id",
    new."name",
    COALESCE((SELECT group_concat("tag", ' ') FROM "ItemTag" WHERE "itemId" = new."id"), ''),
    COALESCE(new."description", '')
  );
END;

CREATE TRIGGER "Item_search_update" AFTER UPDATE ON "Item" BEGIN
  DELETE FROM "ItemSearch" WHERE "itemId" = old."id";
  INSERT INTO "ItemSearch" ("itemId", "name", "tags", "description")
  VALUES (
    new."id",
    new."name",
    COALESCE((SELECT group_concat("tag", ' ') FROM "ItemTag" WHERE "itemId" = new."id"), ''),
    COALESCE(new."description", '')
  );
END;

CREATE TRIGGER "Item_search_delete" AFTER DELETE ON "Item" BEGIN
  DELETE FROM "ItemSearch" WHERE "itemId" = old."id";
END;

CREATE TRIGGER "ItemTag_search_insert" AFTER INSERT ON "ItemTag" BEGIN
  UPDATE "ItemSearch"
  SET "tags" = COALESCE((SELECT group_concat("tag", ' ') FROM "ItemTag" WHERE "itemId" = new."itemId"), '')
  WHERE "itemId" = new."itemId";
END;

CREATE TRIGGER "ItemTag_search_update" AFTER UPDATE ON "ItemTag" BEGIN
  UPDATE "ItemSearch"
  SET "tags" = COALESCE((SELECT group_concat("tag", ' ') FROM "ItemTag" WHERE "itemId" = new."itemId"), '')
  WHERE "itemId" = new."itemId";
END;

CREATE TRIGGER "ItemTag_search_delete" AFTER DELETE ON "ItemTag" BEGIN
  UPDATE "ItemSearch"
  SET "tags" = COALESCE((SELECT group_concat("tag", ' ') FROM "ItemTag" WHERE "itemId" = old."itemId"), '')
  WHERE "itemId" = old."itemId";
END;

CREATE TRIGGER "StorageUnit_search_insert" AFTER INSERT ON "StorageUnit" BEGIN
  DELETE FROM "StorageUnitSearch" WHERE "unitId" = new."id";
  INSERT INTO "StorageUnitSearch" ("unitId", "name") VALUES (new."id", new."name");
END;

CREATE TRIGGER "StorageUnit_search_update" AFTER UPDATE ON "StorageUnit" BEGIN
  DELETE FROM "StorageUnitSearch" WHERE "unitId" = old."id";
  INSERT INTO "StorageUnitSearch" ("unitId", "name") VALUES (new."id", new."name");
END;

CREATE TRIGGER "StorageUnit_search_delete" AFTER DELETE ON "StorageUnit" BEGIN
  DELETE FROM "StorageUnitSearch" WHERE "unitId" = old."id";
END;

-- Everything that was already stored before the index existed. Without this
-- the feature would only find things registered from today onwards, which is
-- the kind of gap nobody notices until they go looking for an old box.

INSERT INTO "ItemSearch" ("itemId", "name", "tags", "description")
SELECT
  "Item"."id",
  "Item"."name",
  COALESCE((SELECT group_concat("ItemTag"."tag", ' ') FROM "ItemTag" WHERE "ItemTag"."itemId" = "Item"."id"), ''),
  COALESCE("Item"."description", '')
FROM "Item";

INSERT INTO "StorageUnitSearch" ("unitId", "name")
SELECT "id", "name" FROM "StorageUnit";
