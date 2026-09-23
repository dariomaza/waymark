# 17. A machine token is a smaller key, not a role

- Status: accepted
- Date: 2026-09-23

## Context

An MCP server is going to read this inventory so an assistant can answer "which
box is the drill in". Today the API understands one kind of caller: a person,
with a username, a password and a session (ADR 5, ADR 6).

Giving a machine that credential means putting a household member's password in
an environment file. Three things are wrong with it, and only the third is
about permissions:

1. **It cannot be revoked.** Turning the machine off means changing that
   person's password, which signs them out of their own phone as a side effect
   of stopping a script.
2. **Nothing records that it is a machine.** A session in the table is a
   session. Nobody can answer "is that integration still running" or "was that
   request the assistant or was it me", so nobody ever revokes anything.
3. **It can do everything the person can**, including empty a storage unit and
   delete an item.

So: a named, long-lived credential that is not a user. Created from a shell,
stored hashed, revoked on its own, and recording when it was last used.

The first two points are uncontroversial — they are the same argument ADR 6
already makes for opaque server-side sessions, applied to a different caller.
The third is not, and it is what this ADR is really about.

## The tension with ADR 5, stated honestly

ADR 5 says: one shared inventory, users are credentials and nothing more, **no
roles and no permissions**. Authentication answers "may you in at all", never
"may you touch this row". A `read` scope that refuses a write is, on its face,
exactly the permission check ADR 5 forbids.

It would be easy to wave that away, and the wave would be dishonest. So, plainly:

**This ADR adds an authorization check that ADR 5 said would not exist.** There
is now a request that authenticates successfully and is refused anyway. That is
new, and it is a real cost: it is one more reason a call can fail, one more
thing to reason about when a request is refused, and — the part that matters
most — the first step on the road ADR 5 was built to avoid, because every role
system in history started as one flag that was obviously fine.

What makes it worth paying is that ADR 5's argument is about PEOPLE, and every
sentence of it still holds for people:

- **Its stated reason is data isolation**, and the expensive option it rejected
  was per-user inventories: an owner id on every entity and every query scoped
  by it, with a permanent class of bug where one unscoped query leaks somebody
  else's boxes. A machine token adds no owner column, scopes no query, and
  carries no user id. That bug class still cannot exist, for the same reason:
  there is still nothing to scope.
- **Its other reason is that the household does not need it.** "The household
  needs to find where things are; it does not need to hide boxes from each
  other." Also still true. No person is narrowed by anything here. Every
  authenticated human may still perform every inventory operation, which is
  asserted directly in `caller.test.ts`.
- **Its acceptance of "anyone with an account can delete anything"** rests on
  two things: accounts are created by hand, and the delete path refuses
  non-empty units. Both still hold — and both are arguments about a person who
  can be told to be careful.

That last clause is the whole difference. ADR 5 is a decision about what to
model for a household of three people who trust each other. The thing holding a
machine token is not a person, cannot be told to be careful, and cannot be
asked afterwards what it was thinking. An assistant that has been talked into
emptying a storage unit is a real failure mode with a real literature behind it,
and "the model should not have done that" is not a control.

A read-only token is not a statement about who is trusted. It is a smaller key,
and the reason to cut one is that the thing holding it is a program.

## Decision

**A machine token carries a scope: `read` or `read-write`.** Two values, and
there will not be a third.

The line is drawn at exactly one question — may this credential change anything
— because that is the only question whose answer differs between a person and a
program. Anything finer ("may delete", "may touch the garage only") is the role
system ADR 5 refused, would need the owner columns ADR 5 refused, and is
refused here too. If a future change wants a third value, it should reopen ADR 5
rather than extend this list, because a third value is the point at which this
stops being a key and starts being a role.

**Scope is enforced at the transport, by HTTP method**, in the same hook that
authenticates the caller — before the body is parsed, before a schema sees it
and before any use case runs. A refusal therefore cannot have changed anything.
The domain is untouched and knows nothing about any of this, which is what
keeps the rule from leaking into the inventory model: `packages/domain` does not
import a single thing added by this ADR.

The set is a denylist of reads (`GET`, `HEAD`, `OPTIONS`) rather than an
allowlist of writing routes, because a list of routes goes stale the day
somebody adds one and it goes stale in the dangerous direction.

**A refused write is 403.** ADR 8 splits 409 "fix the world, then retry" from
422 "fix the request, then retry". This is neither: the request bytes are
correct and the world is correct, and the identical call succeeds the moment a
read-write token makes it. What has to change is the credential. 403 is what
RFC 9110 has for "understood, authenticated, refused to authorize"; 401 would
mean "authenticate", which this caller already did successfully. The body's
`details` name the token and the scope a caller would need, so the operator
reading the MCP server's log knows what to reissue.

**A machine token is a separate `Authorization` scheme**, `Machine`, not a
prefix inside `Bearer` and not a second header. The scheme is read once and the
request goes to exactly one authenticator, so neither credential is ever looked
up under the other's scheme — a leak of one cannot be replayed as the other.
The alternatives and why they lost are argued in `machine-token-header.ts`.

**The secret is hashed with SHA-256, not with the scrypt `create-user` uses.**
A KDF is slow to make guessing expensive, and there is nothing to guess: the
secret is 256 uniform random bits from a CSPRNG, so an attacker holding the hash
faces 2^256 either way. Being long-lived changes the window an attacker has, not
the search space. Meanwhile the cost is real and lands on every request a
machine makes rather than on one login a month, which `login.ts` already names
for what it is — "a denial of service primitive pointed at our own server". The
obvious rescue, caching verified tokens, was rejected because a cache of
verified credentials is a second copy of revocation state, and ADR 6 says
revocation is immediate. The full argument is in `machine-token-secret.ts`.

**Machine tokens are outside the login rate limiter.** ADR 7 put that limiter
there to make password guessing expensive, keyed on the client address and
counting failures. A machine token does not log in, cannot be guessed, and is
the one caller that legitimately makes hundreds of requests a minute. Counting
it would throttle the integration this ADR exists to enable while doing nothing
about an attacker.

**`lastUsedAt` is stamped at most once an hour**, not once a request. A machine
is the one caller that reads in a loop, so an unthrottled stamp would turn an
assistant walking a forty-box inventory into forty writes on a single SQLite
file. It is the throttle `SESSION_RENEW_AFTER_MS` already uses, with a tighter
window because a person reads this field to decide whether a credential is still
in use.

## Consequences

- An MCP server gets a credential that can be revoked without touching a person,
  and that can be narrower than the person who issued it.
- There is now a request that authenticates and is refused anyway. That is the
  cost, and it is paid once, at one boundary, for one question.
- **ADR 5 is amended, not overturned.** Users are still credentials, there are
  still no roles for people, there is still no owner column and no scoped query,
  and every authenticated human may still do everything. What changed is that
  not every credential is a human.
- A third scope value would be a role system. It should reopen ADR 5.
- `GET /auth/me` now answers two shapes. A session still answers `{ user }`
  exactly as it did, so neither client changed.
- The domain package needed no change at all — the same sentence ADR 5's
  consequences open with.
