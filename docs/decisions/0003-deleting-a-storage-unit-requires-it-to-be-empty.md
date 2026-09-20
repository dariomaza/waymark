# 3. Deleting a storage unit requires it to be empty

- Status: accepted
- Date: 2026-09-20

## Context

Deleting a unit that still holds contents has three possible behaviours:
cascade delete, reparent contents automatically, or refuse. Cascade is the
most convenient to implement and the way entire inventories get destroyed by
one mis-click.

The physical world already encodes the right answer: you do not throw away a
full box. You empty it first, then discard it.

## Decision

`DeleteStorageUnit` fails with `StorageUnitNotEmpty` when the unit holds any
item **or** any child unit. Emptiness means both; a wardrobe with no loose
items but three full boxes inside is not empty.

Because that rule is only tolerable with tooling to satisfy it, two supporting
use cases are part of the same decision:

- `MoveItems(itemIds[], targetUnitId)` — bulk move, so emptying is not a
  one-by-one chore.
- `EmptyStorageUnit(unitId, targetUnitId?)` — moves all items and child units
  to the parent, or to an explicit target. This turns "empty then delete" into
  two clicks.

Deleting an item is unconditional, but must release its photo files.

## Consequences

- No destructive cascade exists anywhere in the domain.
- Deletion is a two-step flow; the UI should offer "empty into parent"
  directly from the failed delete.
- Orphaned photo cleanup becomes an explicit responsibility of item deletion.
