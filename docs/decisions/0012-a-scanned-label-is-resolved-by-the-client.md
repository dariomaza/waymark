# 12. A scanned label is resolved by the client, against the forest it already has

- Status: accepted
- Date: 2026-09-20

## Context

Every storage unit carries a `publicId` and its QR encodes
`<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>` — a URL pointing at the web client,
because Android's stock camera offers to OPEN a URL and merely offers to copy
a string. That address is the product's front door: it is the one thing
printed on a box, and it is opened by a phone that may never have run the app.

Nothing in the API answers it. `GET /storage-units/:id` takes the internal id,
and there is no `GET /storage-units/by-public-id/:code`. The repository port
has no `findByPublicId` either, so adding a route would mean a new port
method, a new adapter method, a new contract case for both repository
implementations, and a new entry in a contract already shipped to two clients.

So the client that receives `/u/<code>` has to turn a code into a unit with
what the API already offers.

## Decision

**The web client resolves the code itself, over `GET /storage-units`.**

That route answers with the whole forest, nested, and every node carries its
`publicId`. The client already fetches it: it is the home screen, it is the
picker behind every move, and it is what the scope chip on the search screen
reads a unit's name from. Resolving a scanned code is therefore a `find` over
a response that is usually already in the cache, and the screen at `/u/:code`
redirects to `/units/:id` — replacing its own history entry, so going back
from the box does not land on the redirect again.

The size of that response is the whole argument. ADR 1 sized the tree at four
or five levels of a house and chose an adjacency list over closure tables for
the same reason; ADR 11 computes search scoping from one `findAll` rather than
a second recursive CTE, and says why. A forest of tens of units is small
enough to shape in memory, and this is the third place that has now been true.

The rejected alternative is a new endpoint. It is the better answer the day
this inventory is large enough that the forest is not worth loading — at which
point the home screen has the same problem and both change together.

## Consequences

- No change to the API, its ports, or the contract suites, to ship the
  flagship feature of the product.
- Scanning costs nothing browsing did not already cost: the same cached
  forest answers both.
- A label whose unit was deleted is a clear sentence — "no unit in this
  inventory carries the code" — rather than a 404 that looks like a bug in
  the app.
- The lookup is only as fresh as the cached forest. A unit created on another
  phone thirty seconds ago resolves after the next fetch of the tree, which
  is what the query cache's staleness rules already decide.
- If the inventory ever outgrows loading the forest, this moves to the API
  and the client keeps the same screen.
