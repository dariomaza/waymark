# 15. Every item is one unpaginated request, and every row carries its location

- Status: accepted
- Date: 2026-09-21

## Context

"Everything you own" is a screen in the web client, and there was no route
behind it. The client built it from `GET /storage-units` for the forest and
then one `GET /storage-units/:id` per unit, flattening and sorting the result
itself. Its own comment said what that was:

> It is still N+1 over HTTP, and the honest fix is a `GET /items` on the API
> rather than anything cleverer here.

N+1 over a home connection, from a phone, through a Cloudflare Tunnel. It also
put the ORDER in the client, where it was one `localeCompare` with no
tie-breaker — so two reads of an unchanged inventory could come back shuffled,
and two clients could disagree about the same list.

Two questions had to be answered: what a row is, and whether the answer is
paginated.

## Decision

### A row is an item AND where it is

`GET /items` answers `{ items: [{ item, path, location }] }` — the same two
shapes a search hit carries, minus `matchedFields`, because nothing matched
anything.

A flat list of names is close to useless in a product whose entire purpose is
knowing WHERE something is: "you own a cordless drill" is something the person
already knew. `path` is the units themselves so every step can be made
tappable; `location` is the same path already joined so a list row does not
have to do it. That is the rule ADR 11 set for search, applied to the one
other screen that lists things from all over the house.

The paths are computed in the `ListItems` use case from ONE read of the
forest, not by walking ancestors per item — forty items in one box would
otherwise be forty walks to the same root, which is the N+1 moved server side
rather than removed. The ordering is there too, and it is total: name, then
id, because without the tie-breaker the list appears to shuffle itself.

### There is no pagination

A house with four hundred boxes is a few thousand items, and a few thousand of
these rows is a fraction of a megabyte — less than the client was already
transferring as tens of separate unit responses, over one connection instead
of tens. This is the same reading of a homelab inventory that ADR 1 made for
the tree, ADR 11 for computing search scope in memory and ADR 12 for resolving
a scanned label against the cached forest. It is the fourth place it holds,
and the four move together the day it stops holding.

Pagination would also have to be wrong about something. The order is
alphabetical, so a cursor is a name that is neither unique nor stable — an
edit moves a row across the page boundary (ADR 14 made that possible), and an
offset shifts the moment somebody else in the house adds an item. And the
screen is "everything you own": people scan it and use the browser's own find
on it, which infinite scroll takes away.

The honest answer to an inventory too large to list is SEARCH, which this
product already has, is named after, and which takes a limit for exactly this
reason.

So the route takes no parameters at all — and REFUSES the ones it does not
take. A `?limit=20` quietly ignored would tell a client it had been handed the
first twenty of something.

### The port gained `findAll`

`ItemRepository.findAll` was deliberately absent, on the grounds that nothing
in production wants the whole item table. That stopped being true here. It is
the same bargain `StorageUnitRepository.findAll` already makes, one level down
and with a bigger N, and it runs in the shared contract suite against both
implementations like every other port method.

## Consequences

- The "everything you own" screen is one request, and the order is the API's
  answer rather than each client's opinion.
- The web client no longer needs the forest to draw that screen at all.
- The bytes of an answer grow linearly with the inventory, with no ceiling.
  That is a real limit, it is written down here, and `ListItems` is the one
  place a page would go.
- A row survives stored data the domain says cannot exist: an item whose unit
  is missing is listed with no path rather than taking the whole screen down,
  and a tree a bad restore turned into a cycle terminates rather than hangs.
