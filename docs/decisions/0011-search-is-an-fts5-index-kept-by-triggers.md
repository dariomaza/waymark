# 11. Search is an FTS5 index kept honest by triggers, and ranked in the domain

- Status: accepted
- Date: 2026-09-21

## Context

"Find anything again by searching by name, unit, or location" is in the first
paragraph of the README, and it is the feature the product is named after:
things get lost inside a house, and this is the way back to them when there is
no label in front of you to scan. It is not a filter box bolted onto a list.

(This ADR was written when the product was called Ariadna, and that sentence
read "the house is the labyrinth, this is the thread". The decision below is
unchanged; only the sentence that motivates it has been rewritten against the
name the product actually has. See the README for why the name moved.)

Four things had to be true, and they pull in different directions.

1. **Accent insensitivity, in both directions.** The only person using this
   writes Spanish on a phone. `camara` must find `cámara` AND `cámara` must
   find `camara`. Get this wrong and the feature feels broken to its only user.
2. **Prefix matching**, because `cab` should find `cables` before the word is
   finished.
3. **Tags must be searchable as text.** The entire reason to write `cables` on
   an item called `HDMI 2.1` is so that searching `cables` finds it. A tag only
   a dropdown can reach is a tag nobody will type.
4. **Every result must carry its breadcrumb.** A result that says an item
   exists but not where it is answers nothing.

The immovable one is the first. Accent folding cannot be expressed as a SQL
predicate: SQLite has no `unaccent`, and `LIKE` compares the bytes it is given.

## Decision

### Retrieval is a SQLite FTS5 index

`ItemSearch` over name, tags and description; `StorageUnitSearch` over name.
Both tokenized `unicode61 remove_diacritics 2`, which folds the accents out of
the stored text and out of the query, so the comparison never sees one. Both
carry `prefix = '2 3 4'` indexes, which is where search-as-you-type spends its
time.

The honest alternative was to scan: load every item and every unit and fold
them in JavaScript on every query. That is always right and can never go
stale, and it is exactly what the in-memory repository does. It was rejected
for production because a scan means pulling the whole inventory into the
process on every keystroke, over a home connection, from a phone.

### The index is maintained by triggers, not by application code

This is the load-bearing half of the decision, because the cost of an index is
not that it is complicated — it is that it can go stale, and **a stale search
index does not fail. It quietly stops finding a box**, months later, in a
garage, which is the precise failure this product exists to prevent.

An index the repositories updated would be a second copy of the truth kept in
step by code that has to remember — the same shape ADR 10 refused for the photo
queue, and for the same reason. So nine triggers on `Item`, `ItemTag` and
`StorageUnit` rebuild the index inside the SAME transaction as the write that
changed the row. There is no write path that can skip them: not the adapter,
not a future migration, not somebody with a `sqlite3` prompt at 2am. A rolled
back transaction takes the index change with it.

`search-index.test.ts` pins that by writing straight into the base tables with
raw SQL and then searching. An application-maintained index cannot pass that
test; a trigger-maintained one cannot fail it.

The residual risk is real and worth naming: `schema.prisma` cannot declare a
virtual table or a trigger, so `prisma migrate dev` does not see them, calls
them drift, and offers to DROP the entire index. That is a trap with no error
message at the end of it, so it is guarded three ways — a warning at the top of
the schema, the tests above, and `--create-only` as the documented way to add a
migration.

### Ranking lives in the domain, not in the index

The port hands back candidates. It is not asked to order them, score them,
scope them to a subtree or cut them to a limit.

An adapter over FTS5 and the in-memory one can be made to agree on WHICH rows
contain a word. They can never be made to agree on a bm25 score, so a port that
promised an order would promise something only one of its implementations could
keep, and the shared contract suite — the thing that makes these ports worth
their indirection — could not pin the part that matters most.

Ranking is product judgement anyway, not arithmetic:

- **A name beats a tag beats a description.** A name is what somebody
  deliberately called a thing; a tag is a label they deliberately put on it; a
  description is prose that happens to mention a word.
- **A whole word beats a word the query merely starts**, so `cable` ranks
  `Cable` above `Cablerio` while the prefix still matches.
- **A match spread across several fields ranks below all three.** An item
  called `Cable HDMI` tagged `video` does answer `cable video`, but neither its
  name nor its tags answer it alone, and ranking it as a name match would put
  it above an item actually called `Cable de video`.
- **Name, then id, break every remaining tie**, because without a total order
  two reads of an unchanged inventory can come back in a different sequence and
  the screen appears to shuffle itself.

bm25 was the obvious thing to reach for and buys nothing here. Its value is
inverse document frequency over a large corpus; on a few thousand short strings
FTS5 clamps the IDF to a constant anyway, and what is left is a number nobody
can explain to the person wondering why their drill is third.

A consequence worth having: because the domain re-checks every candidate with
the same folding rules, a stale index cannot produce a WRONG answer. It can
only produce a missing one — which is what the triggers are for.

### The scope is a subtree, computed from the tree

`?within=<unitId>` means the whole subtree at any depth, because a location IS
a storage unit (ADR 1) and "in the garage" means everything under it. An item
held directly by the scope unit is inside it; the scope unit itself is not a
result, because a box is not inside itself.

The subtree is computed in the use case from one `findAll`, not with a second
recursive CTE in the adapter. ADR 1 already decided the forest is small enough
to shape in memory, and one implementation of "what is under this" cannot
disagree with itself.

The limit is applied last, after scoping and ordering. Cutting candidates
earlier would answer quickly with the wrong twenty — and the port takes no
limit at all for the same reason.

## Consequences

- Search is correct across create, rename, retag, move and delete, and the
  contract suite runs those cases against both implementations.
- `packages/domain` gains a port and a use case and still has no dependencies.
- The fake and the Prisma adapter return the same results in the same order,
  which no bm25-ranked port could have promised.
- `prisma migrate dev` will offer to drop the index. Use `--create-only`.
- Moving to Postgres later is the one place this decision costs: the index is
  the only SQLite-specific SQL in the project. `tsvector` with `unaccent` is
  the direct equivalent, the triggers map one to one, and the domain half —
  which is all of the ranking — does not move at all.
- Storage units are searched by name only. Their descriptions are notes about
  what they hold, and what they hold is already searchable as items.
