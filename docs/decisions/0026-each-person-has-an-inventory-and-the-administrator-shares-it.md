# 26. Each person has an inventory, and the administrator shares it

- Status: accepted
- Date: 2026-10-01
- Supersedes: ADR 5. Amends: ADR 6, ADR 17, ADR 18.
- Amended: 2026-10-03 — generated temporary passwords and the forced change.

## Context

ADR 5 chose one shared inventory, where a user is a credential and nothing more.
Its reasoning was that the household needs to find things and does not need to
hide boxes from each other. ADR 6 created accounts from a shell.

The owner has changed the requirement (2026-10-01):

- **The first account on a deployment is the administrator.** The administrator
  creates the other accounts from the app.
- **Each person sees only their own things.** Nothing is shared between people
  by default.
- **The administrator sees everything,** and may share a space with someone,
  which shares everything under it as well.
- **Sharing is either "view" or "view and edit".** The administrator chooses
  which, each time.

This is ADR 5's option 3, the one it rejected as expensive, with grants added on
top. ADR 5 named the cost exactly, and the cost has not gone away. Every read
must be scoped by person, and that creates a permanent class of bug in which one
unscoped query shows somebody else's boxes. This ADR exists to pay that cost
once, by construction, rather than on every route by being careful.

Mapping the code before writing this found where the leaks would come from
today:

- Three routes read repositories directly and never go through a use case:
  - `GET /storage-units`
  - `GET /storage-units/:id`
  - `GET /items/:id`
- Photo bytes are served by photo id alone, with no check of whose item the
  photo belongs to.
- A breadcrumb walks all the way to the root, so it names every ancestor on the
  way.
- Search computes its `within` subtree in memory, after the full-text match.

## Decision

### Who owns what

- **Ownership lives on root spaces only.**
  - A root `StorageUnit` has an `ownerId`.
  - Every space and item below it belongs to that root's owner, through the
    tree.
  - A database check keeps `ownerId` set on roots and empty everywhere else.
  - So ownership has exactly one source, and moving a subtree carries its
    ownership along with no extra writes.
- **Creating a root makes you its owner.** Creating anything under an existing
  space adds it to that space's owner's inventory, even when somebody else
  creates it through an editable share.
- **An item or space moves only between places you may edit,** both the place it
  leaves and the place it lands. Ownership follows the destination.
  - Taking a box out of a shared space is no more power than an editable share
    already gives, since an editable share already allows emptying it and
    deleting it.
  - Turning a space into a root is the exception. Only its owner or an
    administrator may do it, and the space keeps its owner. Otherwise, an
    editable share would be a way to take ownership of what was shared.

### Roles

- **Two roles: `administrator` and `user`.**
- There is no global read-only role. "View only" belongs to a share, because it
  answers "what may this person do with this space", and a role answers
  something nobody asked.
- **An administrator may see and edit everything, and is the only one who
  shares.**
- A user may see and edit their own inventory, plus whatever has been shared
  with them, at the level it was shared.
- **There is always at least one active administrator.** Demoting or disabling
  the last one is refused with 409, because the world has to change first
  (ADR 8).

### Shares

- **A share is `(space, person, view | edit)`.** It may sit on any space, not
  only on a root, and it covers everything under that space.
- **A share is placed on a space, never on an item.** A per-item permission
  would make every row a question, which is the bug class this ADR exists to
  close.
- **When shares overlap, the most permissive one wins.** Someone may view the
  whole garage and edit one shelf inside it.
- **A shared space is a root for the person it is shared with.** It appears at
  the top of their home screen, and its breadcrumb starts at that space. Spaces
  above it are invisible to that person, and that includes their names in a
  breadcrumb.

### One place decides what a person may see

**`Access` is a domain value.** It is resolved once per request from the caller,
and every use case takes it.

```ts
type Access =
  | { kind: "everything" }                      // an administrator
  | { kind: "scoped"; spaces: ReadonlyMap<UnitId, "view" | "edit"> };
```

- **`scoped.spaces` lists every space the person may reach, already expanded
  down the tree** from what they own and what has been shared with them. That
  expansion is done by one function, `resolveAccess`, in `packages/domain`.
  Nothing else walks the tree to decide visibility.
  - A household is small enough to resolve this whole on every request. ADR 15
    already loads every item in one request.
- **Every inventory use case takes `Access` as a required parameter.** If a call
  forgets it, the code does not compile; a review does not have to catch it.
- **No route reads an inventory repository.** The three routes above become use
  cases. A guard test, built on the TypeScript compiler API like the i18n
  guards, fails if an inventory route file imports a repository.
- **Repositories filter in the query wherever a limit applies.** Search receives
  the reachable space ids and applies them *before* `LIMIT`. Otherwise one
  person's hits would push another person's visible results off the page.
- **Something you may not see does not exist.** It answers 404, exactly as a
  missing id does. A 403 would confirm that the id is real.
  - A view-only person who tries to edit something they *can* see gets 403. They
    already know it exists, and what they lack is authority (RFC 9110).

**The contract suite proves invisibility, port by port and use case by use
case.** It uses one fixture: two people, one share of each kind, and one space
shared with nobody. Against that fixture, the unshared space must be absent from
each of these:

- the tree and a single space
- every item and a single item
- photos and photo bytes
- the background-removal queue
- search, both with and without `within`
- the QR images
- a breadcrumb
- the label sheet and `/u/<publicId>`, which resolve against the tree that comes
  back (ADR 12)
- every MCP tool

Every write must be refused against that same space, including a move into it
and a move out of it. The suite runs against the in-memory fakes and against
Prisma, as every contract suite does.

### Accounts

- **The first account is still created from a shell, and it is the
  administrator.** `create-user` makes an administrator when no user exists
  yet, and otherwise makes a user unless it is given `--admin`.
  - There is still no sign-up, and there is no first-run screen either. A setup
    page on an internet-facing box belongs to whoever reaches it first.
- **An administrator manages the other accounts from the account screen.** That
  means creating an account, changing its role, resetting its password and
  disabling it.
  - ~~The administrator types the new password~~ — amended on 2026-10-03: the
    server generates a temporary one, and the person must replace it at their
    first sign-in. See *Amended (2026-10-03)* below. It is still handed over in
    person; nothing is emailed, because there is no mail.
- **Disabling** revokes every session and machine token the account holds, and
  stops it signing in.
- **Accounts are disabled, never deleted.** Deleting one would leave its
  inventory with no owner. Reassigning that inventory is a separate act, and it
  can wait until somebody needs it.

### Machine tokens

- **A machine token now belongs to the person who issued it.** It acts as that
  person, narrowed by its scope (ADR 17), so the MCP server sees exactly what
  its issuer sees.
  - ADR 18 argued against `userId` because a column nobody reads goes stale.
    `resolveAccess` now reads it on every request.
- **Rotating a token keeps its owner,** as it keeps the name, the id and the
  scope (ADR 18). Otherwise an administrator who rotated someone's token would
  turn it into one that sees everything.
- **People see the tokens they issued; an administrator sees all of them.**
  - ADR 18's argument that everyone who could mint a token should see it still
    holds. Under this ADR, the only person who can mint a token in somebody
    else's name is an administrator.
- **A token may be narrowed to chosen spaces, never widened.** Whoever issues
  it may pick spaces; the token then reaches what its issuer can reach *within*
  those spaces and everything under them, and its scope still applies on top.
  No spaces picked means the issuer's whole reach. Because it is an
  intersection, a token can never hold what its issuer does not: when the
  issuer loses a share, the token loses it with no step anyone has to remember.
  This amends ADR 17, whose argument that anything finer than a scope is a
  role rested on ADR 5's missing owner column.

### Migration

The production database has no inventory yet (owner, 2026-10-01). The migration
is still written so that it does not depend on that:

- The oldest account becomes the administrator.
- That account becomes the owner of every existing root space and machine token.
- Every other existing account gets an "edit" share on every existing root.

So on the day of the deploy, everybody sees what they saw the day before.

## Consequences

- **The bug class ADR 5 avoided now exists.** It is contained by four things:
  - one function that decides visibility;
  - a required parameter that the compiler enforces;
  - a guard test that stops routes reading repositories;
  - a contract fixture that every read path must pass.

  Even so, a new read path is the most dangerous change a contributor can make
  in this repository, and the contract fixture is where it gets caught.
- **`packages/domain` changes.** ADR 5's first consequence, that the domain
  needed no change for accounts, no longer holds. Ownership, shares and `Access`
  are domain concepts now.
- **Every request does one extra tree walk.** That is cheap at household size.
  If it ever stops being cheap, the fix is to cache `Access` per request, not to
  store descendants.
- Only an administrator can share. A person who wants to lend the pantry to
  their partner has to ask the administrator. If that turns out to be wrong, the
  change is to the rule about who shares, not to the model.
- A person cannot hand an item to someone whose inventory they cannot edit.
  Moving something between inventories requires edit access to both.
- Disabled accounts and their inventories accumulate. Reassigning ownership is
  deliberately left out until it is needed.
- Both clients gain the same new surfaces (ADR 22). They are:
  - a *People* group on the account screen, shown only to an administrator;
  - *Share* in a space's menu (ADR 21), shown only to an administrator;
  - the person's role in `/auth/me`;
  - for an administrator, the home screen groups other people's root spaces
    under their names.

## Amended (2026-10-03): generated passwords, and the forced change

### What changed

- **The administrator no longer chooses a password.** `POST /auth/accounts`
  takes `{ username, role }` and `POST /auth/accounts/:id/password` takes no
  body. A `password` sent to either is refused with 400, as the unknown key it
  now is, so a client still built for the old routes cannot believe it set one.
  - The server generates a temporary password and answers it **once**, as
    `{ account, temporaryPassword }`. Only its scrypt hash is stored, and it is
    never logged. Both answers are `POST`s, which ADR 13 never caches. The
    clients are to treat it as ADR 18's *A secret in a browser* treats a
    machine token secret: shown once, kept only in component state, warned
    about before it can be dismissed.
  - **Its format** is four groups of four lower-case letters, such as
    `wxmc-hepa-rtkd-ufbn`, drawn with `crypto.randomInt` from 23 letters: the
    alphabet without `i`, `l` and `o`, which read as `1` and `0`. There are no
    digits and no capitals, so a phone keyboard never changes layer.
  - **Its entropy is 16 × log2(23) ≈ 72.4 bits**
    (`TEMPORARY_PASSWORD_ENTROPY_BITS`, asserted to be at least 64). It lives
    behind a rate-limited sign-in and an scrypt hash, and it lives until the
    person's first sign-in.
- **A generated password must be changed.** A new column,
  `User.mustChangePassword`, is set on create and on reset. Every account that
  existed before is `false`, and so is every account `create-user` makes: the
  operator typed that password at a shell, and it is already theirs.
- **A flagged account is restricted, in one place.** The authentication hook,
  where `request.caller` is set, refuses every route but `GET /auth/me`,
  `POST /auth/logout` and `POST /auth/password` with 403
  `PASSWORD_CHANGE_REQUIRED`. It is not checked route by route, where the next
  route added would be the one that forgot. `/auth/me` and the sign-in answer
  carry `mustChangePassword`, so a client knows which screen to show.
  - **A passkey sign-in is restricted the same way.** A reset keeps passkeys
    (ADR 19), but the flag is the account's and the account is read on every
    request, so whichever door opened the session, it opens only these three
    routes.
  - **Machine tokens.** A flagged account cannot create one: the route is
    refused by the hook. A token it already held keeps working, and is not
    restricted, because a reset does not revoke machine tokens
    (`ManageAccounts.resetPassword`, the "keeps the machine tokens" tests) and
    the restriction applies to sessions. Revoking it, or disabling the account,
    is how it stops.
- **A person changes their own password.** `POST /auth/password
  { password, currentPassword? }`, for anybody signed in, at any time.
  - The 12-character minimum applies. A new password equal to the current one
    is 422 `PASSWORD_UNCHANGED`.
  - With a temporary password the current one is not asked for: having just
    signed in with it is the proof. Otherwise `currentPassword` is required
    (422 `CURRENT_PASSWORD_REQUIRED`), and a wrong one is refused as a sign-in
    refuses it (401 `INVALID_CREDENTIALS`), counted by the same limiter.
  - On success the flag is cleared and every OTHER session of the person ends.
    The one in use stays.
  - A machine token is refused with 403, as on every account route (ADR 18).

### Why

The administrator never knows a password that lasts. Before, the person they
made an account for signed in with a password somebody else had chosen and
seen, and nothing asked them to change it. Now the only password the
administrator ever reads is useless once it has been used: the first sign-in
is followed by a change, and the change ends it.

### What it costs

Somebody who reads the temporary password before the person signs in — over a
shoulder, from a screenshot, from a chat it was pasted into — can sign in
first, and choose a password the real person does not know. The mitigations
are that it is shown once and dies on first use: the person who finds that the
password they were handed no longer works knows at once that somebody used it,
and an administrator resets it again. The window is the time between the
administrator reading it out and the person typing it.

The clients built for the old routes break against these ones. That was
accepted; they follow in the same piece of work.
