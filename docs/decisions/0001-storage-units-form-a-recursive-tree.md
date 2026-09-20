# 1. Storage units form a recursive tree

- Status: accepted
- Date: 2026-09-20

## Context

The first draft modelled a storage unit with a plain-text `location` field.
Real storage is nested: a box sits inside a metal wardrobe, which sits inside
the storage room. A text field cannot express that, and it breaks in three
concrete ways:

1. "What is in the storage room?" becomes a `LIKE '%storage room%'` scan
   instead of a query.
2. Moving the wardrobe to the garage requires manually editing every box
   inside it.
3. `"storage room"` and `"Storage room "` become two different places.

## Decision

A location is not an attribute of a storage unit. It **is** a storage unit.

`StorageUnit` gets a nullable `parentId` pointing at another `StorageUnit`.
A `null` parent means a root (the house, the garage, the storage room).
Rooms, furniture, shelves and boxes are all the same concept at different
depths. The `location` field is removed; the location of a unit is the
computed path to its root, e.g. `Storage room > Metal wardrobe > Box 3`.

`kind` (`ROOM | FURNITURE | SHELF | DRAWER | BOX | BAG | OTHER`) is kept as a
presentational and filtering hint, never as structural meaning. Nesting is not
constrained by kind.

Persistence uses a plain adjacency list (`parentId` column) with recursive
CTEs for path and subtree queries. At homelab scale, real depth is 4-5 levels;
closure tables or materialized paths would be unjustified complexity.

## Consequences

- Moving a subtree is a single `parentId` update; contents follow implicitly.
- Breadcrumbs and "everything inside X" become tree queries.
- Cycles are now possible and must be prevented explicitly. See ADR 2.
- The UI must render a tree, which is more work than a flat list.
