# 5. One shared inventory; users are credentials only

- Status: superseded by ADR 26
- Date: 2026-09-20

## Context

The API is reachable from the public internet, so it needs accounts. "Multi
user" could mean three very different things, and they have wildly different
costs:

1. Several people, one shared inventory.
2. Several people, one shared inventory, with roles.
3. Several people, one private inventory each.

Option 3 is the expensive one. It forces an owner id onto `StorageUnit`,
`Item` and `Photo`, and every single query must be scoped by it. That creates
a permanent class of bug where one unscoped query leaks another person's data,
and no test suite ever fully closes it.

## Decision

One shared inventory. A user is a credential and nothing more.

No owner or tenant id on any domain entity. No query is scoped by user. No
roles and no permissions: every authenticated user may perform every inventory
operation. Authentication answers "may you in at all", never "may you touch
this row".

This is the real requirement. The household needs to find where things are;
it does not need to hide boxes from each other.

## Consequences

- The domain package needs no change at all to support accounts.
- The leak-by-unscoped-query class of bug cannot exist, because there is
  nothing to scope.
- Anyone with an account can delete anything. Acceptable because accounts are
  created by hand (ADR 6) and the delete path refuses non-empty units (ADR 3).
- Adding roles later means touching the use cases, not the schema. Adding
  private inventories later would be a migration and a rewrite of every query.

## Superseded (2026-10-01)

The owner changed the requirement: each person sees only their own things, an
administrator sees everything and may share a space with someone else. That is
option 3 above, with shares added, and ADR 26 pays the cost this ADR names —
by construction, not by care. The reasoning here is left as it was, because it
is why ADR 26 spends most of its length on closing the leak.
