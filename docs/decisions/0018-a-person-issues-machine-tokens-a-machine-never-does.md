# 18. A person issues machine tokens; a machine never does

- Status: accepted
- Date: 2026-09-23

## Context

ADR 17 gave this API a second kind of caller and a CLI to manage it:

```sh
pnpm --filter @waymark/api machine-token create --name mcp-server --scope read
```

It also said, twice and in bold, that there would never be a route for this:

> There is no route that mints a machine token either, for the same reason and
> more so: a machine token is long-lived, so an endpoint that issued one would
> be a door that does not close by itself.

That is a true sentence about the shape of the risk, and it is missing its
subject. It describes an endpoint and never says who is allowed through it.

The cost of the omission is not theoretical. Every token in this house is made
by somebody with an SSH session on the box, which means in practice one person
makes all of them, from one laptop, and nobody else can see what exists. The
field ADR 17 was proudest of — `lastUsedAt`, the one that makes an abandoned
credential visible — is visible to whoever can reach a shell and to nobody
else. A credential nobody can see is a credential nobody revokes, which is the
exact failure ADR 17 introduced that field to prevent, reintroduced one layer
up.

## Decision

**Machine tokens can be listed, created, rotated and revoked over HTTP, by a
person with a session, from the account sheet.**

```
GET    /auth/machine-tokens
POST   /auth/machine-tokens
POST   /auth/machine-tokens/:name/rotate
DELETE /auth/machine-tokens/:name
```

**The CLI stays exactly as it is.** It is how the first token is made on a
fresh install, before there is an account to log in with, and it is the only
way in if the web client will not load. Both drive the same use cases.

### The door, and what closes it

ADR 17's objection stands against a door with nobody at it. What makes this one
different is not that minting is less dangerous — it is not — but that every
one of these routes is behind the session ADR 6 built, and that session is:

- created only against a password that `create-user` set from a shell, because
  there is still no sign-up;
- rate limited per client address (ADR 7), so the door cannot be knocked on;
- revocable by deleting one row, immediately.

A stolen session can now mint a credential that outlives the session it was
minted from. **That is a real widening and it is the cost of this ADR.** What
pays for it is that the same screen makes every credential in the house
visible to everyone who could have minted one, with the date each was last
used — so the thing an attacker would have to do is now the thing everybody can
see was done. Before this, a token minted from a stolen shell was invisible
unless somebody thought to SSH in and look.

### A machine token may not manage machine tokens

**Not with a `read` scope, and not with a `read-write` scope either.** The two
refusals are different mechanisms, and only the second one needed a new rule.

A `read` token is refused by machinery ADR 17 already built: a create, a rotate
and a revoke are all writes, so the scope hook in `build-app.ts` answers 403
`READ_ONLY_MACHINE_TOKEN` before the body is parsed and before any use case
runs. So "a read token cannot mint a write token" is not a check anybody has to
remember — it falls out of the method. Good.

A `read-write` token passes that hook cleanly, and is refused anyway:

1. **A credential that can issue its own successor cannot be revoked.**
   Revoking `mcp-server` is meant to mean the program holding it is out. If it
   could have minted `mcp-server-2` last Tuesday, revocation removes a row and
   changes nothing, and the list gives an operator no way to tell a token a
   person made from one a token made. ADR 17's central promise — a credential
   that can be killed without touching a human account — is withdrawn silently,
   which is the worst way to withdraw it.
2. **There would be nobody at the bottom of it.** `machine-token.ts` argues
   there is no `userId` on a machine token because provenance that nothing
   reads is a column that goes stale. That holds while every token is minted by
   a person. Let a token mint a token and "who authorised this credential"
   becomes a recursive question with no human at the end of it, answerable only
   by the column ADR 5 refused to add.
3. **The codebase had already decided it.** `POST /auth/logout` refuses a
   machine caller outright, "precisely so that a compromised machine cannot
   revoke itself into looking innocent, and so that an MCP server with a bug
   cannot log itself out at three in the morning". Issuing and revoking
   credentials is the same act with a larger radius.

**Listing is refused to machines too**, and this is the one the scope hook
could never have caught, because a `GET` is not a write. Without a check of its
own, a read-only MCP token could enumerate every credential in the house: every
name, every scope, and when each was last used. Nothing issued to answer "which
box is the drill in" has a use for that, and it is precisely the shape of thing
somebody would want before deciding which credential to go after.

The refusal is 403 `MACHINE_TOKEN_CANNOT_MANAGE_MACHINE_TOKENS`. The route
exists and the caller authenticated successfully; what it lacks is authority,
which is what 403 means (RFC 9110).

**ADR 5 is untouched by this.** No person is narrowed. This is the same shape
of statement ADR 17 already makes — a rule about what a program is, not about
who is trusted — and it adds no owner column and scopes no query.

### Rotation is one operation, not a revoke and a create

A client cannot be asked to do this in two calls, because neither order is
safe:

- **Revoke, then create** leaves a window in which the name holds no credential
  at all. Every request in that window is a 401, which is survivable; a crash
  inside it is not, because the operator has destroyed a live credential and
  has nothing to put in its place, on the one credential whose job is to sit in
  a compose file on a machine they may not be near.
- **Create, then revoke** cannot be expressed. The name is unique, so the new
  secret would need a different name — and the name is what revocation is keyed
  by, what the compose file says, and what the operator knows the thing as.

So it is one `UPDATE ... WHERE name = ?` behind a repository method, which
SQLite applies atomically. The row is replaced or it is not; there is never an
instant with two working secrets, and never one with none.

It keeps the name, the id and **the scope** — `MachineTokenRotation` has no
scope field, and the route refuses a `scope` key rather than ignoring it, so
rotation cannot become an escalation path wearing the word "maintenance". It
resets `lastUsedAt` to `null`, because that field describes a secret, and
carrying it across would have it report traffic belonging to one that no longer
exists. The expiry is asked for again rather than carried forward: only the
resulting DATE is stored, never the duration, so carrying it would leave the
date fixed while the credential got younger — a token rotated monthly under a
90-day expiry would lapse the morning after somebody rotated it to keep it
working.

**There is no grace period, and a client mid-request is the reason to say so
explicitly.** A request that already got a caller out of the `onRequest` hook
finishes: it is holding a value, not a lock, and `recordLastUsed` is an
`updateMany` that shrugs at a row that is gone — an ordinary race the
repository contract already covered, because a revoke could always land mid
request. Every request not yet authenticated when the rotation lands is refused
with the same `InvalidMachineToken` a revoked token gets. That is deliberate:
ADR 6 and ADR 17 both rest on revocation being immediate, and a window in which
the old secret still opens the door is a second copy of revocation state — the
exact thing ADR 17 refused to cache verified tokens for. Somebody rotating a
credential usually believes the old one has leaked.

The consequence belongs in the interface rather than in this file: rotating
cuts the machine off until its new secret is in place, and the screen says so
before the button is pressed.

### A secret in a browser

The secret is shown once, on the screen that created it, and the server cannot
produce it again — it kept a SHA-256, which is the property and not a
limitation.

But a secret rendered in a browser is in more places than a secret printed to a
terminal on a box nobody else can reach, and the honest list is: the DOM, so
any XSS on this origin reads it; a screenshot, which on a phone syncs to a
photo library; a screen recording or a shared screen; an OS-level clipboard
history if it is copied; and a browser extension. **None of those are things
this code can prevent**, and claiming otherwise in a comment would be worse
than saying so.

What it does do:

- **It is never cached.** The create and rotate responses are `POST`s, which
  ADR 13 never caches, and `/auth/machine-tokens` matches no runtime caching
  rule — asserted in `pwa-caching.test.ts` rather than left to the pattern.
- **It is never stored client side.** It lives in component state for as long
  as the sheet is open and goes when it closes. Not `localStorage`, not the
  query cache, not the session store.
- **The warning comes before the dismissal, not after.** The panel says it will
  not be shown again while it is still on screen and still copyable, because a
  sentence that appears after the only copy is gone is an epitaph.
- **Copying is offered.** The alternative is somebody transcribing 43 random
  base64url characters by eye, getting it wrong, and reaching for a screenshot
  instead — which is a permanent file in a photo library rather than a
  clipboard entry that the next copy replaces. This is harm reduction, and it
  is a choice rather than an oversight.
- **It is not hidden behind a reveal toggle.** A secret that must be revealed
  to be used gets revealed, and a toggle mostly encourages revealing it at the
  moment somebody is sharing their screen to ask for help.

The real defence is not secrecy of display. It is that this credential is
revocable and rotatable by the person looking at it, which is what this ADR
exists to make possible.

## Consequences

- The person who owns the house can see every credential in it, and kill one,
  without an SSH client.
- ADR 17's "there is no route" is **amended, not overturned**: there is still
  no unauthenticated route, still no sign-up, still nothing a machine token can
  do here, and the CLI is still the only way in on a fresh install.
- A stolen session is now worth more than it was. That is the cost, it is
  named, and the mitigation is that everything minted is visible to everybody
  who could have minted it.
- A machine token can no longer be described as "a credential a program holds
  and a person manages" only by convention. It is enforced, in one place, with
  a test for each of the four routes.
- A third scope value would still be a role system, and would still have to
  reopen ADR 5. Nothing here needs one.
