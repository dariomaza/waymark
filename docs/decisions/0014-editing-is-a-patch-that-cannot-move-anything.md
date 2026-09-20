# 14. Editing is a PATCH whose field list cannot move anything

- Status: accepted
- Date: 2026-09-21

## Context

The first requirement written down for this product was that a storage unit's
information be "consultable en cualquier momento, y editable". The second half
was never built. The domain exposed create, move, empty and delete for a unit,
and create, move and delete for an item, and the API followed:

> Move and empty are named operations rather than a `PATCH`, because a storage
> unit has no general update.

That was true, and it made a typo in a box name permanent. The box already has
a printed label glued to it carrying its `publicId`, so "delete it and make a
new one" is not a workaround — it is a trip to the garage with a printer, and
it throws away the item's photos on the item side. Renaming is not a nice to
have; it is a missing requirement.

Editing has to cover what a thing SAYS about itself: a unit's name,
description and kind; an item's name, description, quantity and tags.
Retagging matters more than it looks — a tag is the entire reason searching
`cables` finds an item called `HDMI 2.1` (ADR 11), and a mistyped tag was
unfixable.

What editing must NOT cover is where a thing IS. Moving a unit is guarded by
the subtree invariant (ADR 2) and moving items is all or nothing across a
batch (ADR 3). Both of those are the operations that can corrupt or lie about
the inventory, and both already have use cases whose names say so.

So the question was the HTTP shape, and it is the shape that decides whether
the guard stays visible.

## Decision

**`PATCH /storage-units/:id` and `PATCH /items/:id`, with a strict field list
that contains no `parentId` and no `storageUnitId`.**

### Why a PATCH and not more named operations

The premise of the old comment has changed: there IS a general update now, and
it is a handful of plain attributes with no rule beyond the field itself. A
named operation per field would give `/rename`, `/redescribe`, `/rekind`,
`/retag` and `/requantify` — five routes for one edit form, and a form that
changed two fields at once would be two round trips that can half-fail. That
is the same failure `POST /items/move` exists to avoid one level up.

A `PUT` was rejected for the opposite reason: a full representation would have
to include `parentId`, `publicId` and `photos`, which are precisely the fields
this route must not accept.

### Why the field list is the guard, not a convention

The schemas are `strictObject`s, so an unlisted key is REFUSED rather than
ignored, and `parentId` and `storageUnitId` are not listed. A request that
tries to rename and move in one call gets a 400 naming the key.

That is the load-bearing half of this decision. Accepting the key and
honouring it would hide the subtree check behind a field that looks exactly as
innocent as a rename. Accepting it and quietly dropping it would be worse: a
client would believe it had moved a box, and nothing on either side would
notice. Refusing it is the only answer that is true in both directions, and it
is enforced by the schema rather than by whoever reads the route next.

`photoId` and `photos` are absent for the same reason: files have their own
lifecycle and their own routes (ADR 9).

### The rest of the shape

- An absent field means "leave it alone"; `null` on a description is the only
  way to take one off. They are different requests and must stay different.
- `tags` is always the COMPLETE list. A revision that could only add would
  leave no way to remove the one that was a typo.
- A body that names nothing to change is a 400. Answering `200` to it would be
  the server agreeing it did something.
- The quantity is not re-validated at the transport layer. `InvalidQuantity`
  is the domain's to raise and it comes back as a 422, exactly as it does on
  create.

## Consequences

- A box can be renamed without losing the label stuck to it, and a tag can be
  corrected without deleting the item and its photos with it.
- The search index follows, for free and by construction: the triggers rebuild
  it inside the same transaction as the write (ADR 11). The HTTP suite renames
  and retags and then searches, so that is verified rather than assumed.
- `PATCH` had to be added to the CORS method list. It is not a simple method,
  so a browser preflights it, and a missing entry would have failed in the PWA
  only — never in a test that injects straight into Fastify.
- Two routes now change a resource, and a reader has to know which. The URL
  answers it: `move` moves, `PATCH` cannot.
- The web client gains an Edit button beside Move rather than instead of it,
  which is the same distinction made where somebody can see it.
