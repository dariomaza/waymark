# Search

The feature the product is named after. Things get stored and then lost — not
lost as in gone, lost as in "it is somewhere in one of forty boxes" — and this
is the way back to them when there is no label in front of you to scan.

```
GET /search?q=cab&within=<unitId>&limit=20
```

```json
{
  "query": "cab",
  "terms": ["cab"],
  "items": [
    {
      "item": { "id": "...", "name": "HDMI 2.1", "tags": ["cables"], "...": "..." },
      "path": [{ "name": "Garage", "...": "..." }, { "name": "Box 3", "...": "..." }],
      "location": "Garage > Box 3",
      "matchedFields": ["TAG"]
    }
  ],
  "storageUnits": [
    {
      "unit": { "id": "...", "name": "Caja de cables", "...": "..." },
      "path": [{ "name": "Garage", "...": "..." }, { "name": "Caja de cables", "...": "..." }],
      "location": "Garage > Caja de cables",
      "matchedFields": ["NAME"]
    }
  ]
}
```

- **Every result carries its breadcrumb.** That is the whole point: "you own a
  cordless drill" is something the person already knew. `path` is the units
  themselves, so a client can make each step tappable; `location` is the same
  path already joined, so a list row does not have to.
- **Items and storage units are two lists**, not one. They answer two
  different questions — "where is my drill" and "where is Box 3" — and
  interleaving them would need a made-up rule for whether a box called
  `Cables` beats an item tagged `cables`.
- **Items match on name, tags and description**; units match on name.
  Searching `cables` finds an item called `HDMI 2.1` that is tagged `cables`,
  which is the entire reason tags are worth having.
- **Accents do not matter, in either direction.** `camara` finds `cámara` and
  `cámara` finds `camara`. The query and the stored text are folded by the
  same rule, so the comparison never sees an accent. `ñ` folds to `n` for the
  same reason.
- **A term matches the start of a word**, so `cab` finds `cables` before the
  word is finished.
- **Every term is required.** `cable usb` does not match a cable that is not
  USB.
- **`within` is a subtree, at any depth.** A location IS a storage unit
  (ADR 1), so "search the garage" means everything under it, four levels down
  included. An item held directly by the garage is in the garage; the garage
  itself is not a result, because a box is not inside itself. A `within` that
  names nothing is a 422 — the id came from the query string, not the path.
- **An empty `q` answers with nothing**, never with everything. A search page
  nobody has typed into yet is not a request to dump the inventory.

## The order, and why

A **name** beats a **tag** beats a **description**: a name is what somebody
deliberately called a thing, a tag is a label they deliberately put on it, a
description is prose that happens to mention a word. A whole word beats a word
the query merely starts. A match spread over several fields — `cable video`
finding `Cable HDMI` tagged `video` — ranks below all three, because neither
field answers the query on its own. Name and id break the remaining ties, so
two reads of an unchanged inventory never come back shuffled.

`matchedFields` ships with every result so a client can say WHY it is there.
The relevance score does not: the order is the promise, and a number clients
could re-sort by would freeze a ranking rule that is meant to improve.

The ranking is computed in `packages/domain`, from the entities, and not by
the index. bm25 is a number that depends on how many other rows happen to
contain the word, and it is the one thing the in-memory repository and the
Prisma adapter could never have been made to agree on — which would have put
the most important half of this feature outside the contract suite.
