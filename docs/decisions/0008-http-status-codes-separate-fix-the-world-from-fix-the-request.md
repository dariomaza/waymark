# 8. 409 means fix the world, 422 means fix the request

- Status: accepted
- Date: 2026-09-20

## Context

The domain raises typed errors that are ordinary outcomes, not faults:
deleting a box that still holds things, moving a unit into its own subtree.
If those reach a client as a generic 500, the Android app cannot tell "this
box has things in it, empty it first" from "the server is down", and the UI
ends up telling the user something untrue.

## Decision

- **409** — the same request bytes will succeed once the world changes.
  `StorageUnitNotEmpty`, `CyclicStorageUnitMove`. Empty the box, or move the
  target out of the subtree, and the identical call works.
- **422** — nothing anybody else does makes these bytes work.
  `MissingEmptyTarget`, `InvalidQuantity`. The request itself must change.
- **404 vs 422** for a missing id is decided by where the id came from. In the
  URL, it is 404. In the body only, it is 422, because a 404 on `POST /items`
  would be a claim about the route rather than about the id.
- **500, explicitly**, for `CorruptStorageUnitHierarchy` and
  `UnknownStorageUnitKind`. These mean the database disagrees with the domain,
  and pretending otherwise would hide it.

Nothing may fall through to an unmapped 500. A completeness test enumerates
every `DomainError` subclass and fails if one has no entry in the table, so a
new domain error breaks the build the moment it is written.

## Consequences

- Clients can render an accurate, actionable message per failure.
- Adding a domain error forces a deliberate decision about its status code.
- The 409/422 split is a rule, not a table to memorise.
