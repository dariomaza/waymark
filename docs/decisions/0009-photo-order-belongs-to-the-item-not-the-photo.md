# 9. Photo order belongs to the item, not to the photo

- Status: accepted
- Date: 2026-09-20

## Context

The photo model carried the same ordering twice.

`Photo.position` existed on the domain entity, and `Photo.position` existed as a
column in the Prisma schema. Separately, `Item.photos` is an ordered array of
photo ids, projected onto an `ItemPhoto` join table whose primary key is
`(itemId, position)`.

Only one of the two was ever read:

```ts
// persistence/item-mapper.ts
export const ITEM_RELATIONS = {
  photos: { orderBy: { position: "asc" } },  // ItemPhoto.position
} as const;

photos: row.photos.map((photo) => photoId(photo.photoId)),
```

`ItemPhoto.position` decides the order and decides the cover, because the cover
is `Item.photos[0]` and nothing else. `Photo.position` was written on create,
defaulted to `0`, and read by nothing.

That is not merely redundant, it is a field that goes wrong quietly:

1. Reordering an item's photos updates the join table. Nothing updates
   `Photo.position`, so from the second reorder onwards the two disagree, and
   because nothing reads the stale one, nothing ever notices.
2. A storage unit points at a single `photoId` and has no order to express at
   all. `position` is meaningless for every photo that belongs to a unit, and
   half the photos in a real inventory are unit photos.
3. Two writable copies of one fact invite a future reader to pick the wrong one.
   The next person to add "sort an item's photos" has a fifty-fifty chance.

The two ways out were: delete `Photo.position`, or delete `ItemPhoto.position`
and make the photo row the source of order.

## Decision

**`Photo.position` is removed, from the domain entity and from the database.
`ItemPhoto.position` stays and is the only place any order is written or read.**

The direction is chosen by asking who owns the ordering.

A photo is a file and a processing state (ADR 4). It is its own aggregate with
its own lifecycle: uploaded synchronously, processed later, possibly never, and
released independently of whatever referenced it. It is referenced BY things —
by an item, which holds several in a deliberate order, and by a storage unit,
which holds exactly one and has no order. The order is therefore a property of
the RELATIONSHIP, not of the photo, and a relationship with attributes is
exactly what the `ItemPhoto` join table already is.

Making the photo row own the order would have been worse in a concrete way: a
photo would carry a number that is meaningful only when an item happens to be
the thing pointing at it, and ordering an item's photos would mean writing to
rows in another aggregate. The `Item` aggregate would no longer be able to state
its own invariant — "these photos, in this order, first one is the cover" —
without reaching outside itself.

There is no `coverPhotoId` field either, for the same reason. The cover is
`photos[0]`, in the domain and in the join table alike, and a second way to say
the same thing is how the two get to disagree. Choosing a cover is spelled as
what it is: a reorder.

## Consequences

- `createPhoto` no longer takes a position, and `Photo` no longer has one. Two
  tests that asserted the default and the passed-through value were deleted and
  replaced by one asserting the property is absent, so the removal cannot be
  quietly undone.
- A migration drops the column. SQLite has no `DROP COLUMN` in the version
  Prisma targets here, so the table is recreated; no data is lost because
  nothing ever read the column.
- `Item.photos` is the single writable ordering, and the repository contract
  already pins it: saving an item REPLACES its photo rows rather than merging,
  so a reorder cannot leave a stale row behind.
- The item gained the operations that ordering implies —
  `attachPhotoToItem`, `detachPhotoFromItem`, `reorderItemPhotos` — on the
  entity, where the invariant lives, rather than in the HTTP layer.
- Photos gained their own repository port, because a thing with its own
  lifecycle needs a way to be stored and released independently of whatever
  currently points at it.
