# 2. Move validation rejects the whole subtree

- Status: accepted
- Date: 2026-09-20

## Context

With a recursive tree (ADR 1), a move can create a cycle. The obvious guard,
"a unit cannot be its own parent" (`parentId !== id`), only catches cycles of
length 1 and gives false confidence. Trace a length-3 cycle:

```
Storage room (parent: null)
Wardrobe     (parent: Storage room)
Box          (parent: Wardrobe)

Move Storage room into Box:
  StorageRoom.parentId = Box

Guard check: Box !== StorageRoom  ->  passes
Result:      Storage room -> Box -> Wardrobe -> Storage room -> ...
```

No unit is its own parent, so the guard passes. But none of the three has a
`null` parent any more, so the whole group is unreachable from any root and
disappears from the tree. Walking ancestors to build a breadcrumb never
terminates.

## Decision

The invariant is expressed over the subtree, not over the direct parent:

> The new parent of a unit must be neither the unit itself nor any of its
> descendants.

The `MoveStorageUnit` use case walks the ancestor chain of the target parent
and rejects the move with `CyclicStorageUnitMove` if the moved unit appears in
it. Walking ancestors is bounded by tree depth and needs no subtree load.

This rule lives in `packages/domain`. A foreign key cannot express it, so it
must not be delegated to Prisma or SQLite.

## Consequences

- `MoveStorageUnit` needs a repository port able to return an ancestor chain.
- Cycle tests must cover depth 1, 2 and 3+, not only self-parenting.
- Moving a unit to `null` (making it a root) is always safe by definition.
