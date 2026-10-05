# Authentication

Each person has an inventory of their own (ADR 26, superseding ADR 5's single
shared house). An account is either an **administrator**, who sees and may edit
every space and is the only one who shares, or a **user**, who sees the spaces
they own and the ones shared with them. Ownership is recorded on root
spaces; everything below a root is its owner's. Every read is scoped by it and
every write checked against it, and a space somebody may not see answers
exactly as a missing one does.

- **A share is on a space, `view` or `edit`, and cascades down the tree.** It
  covers every space and item under it; there are no shares on an item. Only an
  administrator sets one, from the space's menu (the *Share* sheet, in both
  clients): one choice per person, saved as it is made.
- **The home screen is grouped by whose each space is.** A person sees their
  own spaces, then *Shared with you*, with a space shared to look at marked
  so. An administrator sees their own, then each other person's under that
  person's name.
- **Only the owner makes or moves a root.** A space made inside somebody's
  tree, even by a person it was shared with to edit, belongs to that tree's
  owner.

There are three kinds of credential: a password, a passkey (ADR 19) and a
machine token (ADR 17). The first two open the same session for a person; the
third is not a person at all.

- **No sign-up, ever.** The first account is created from a shell on the
  server with `pnpm --filter @waymark/api create-user`. The password is never
  an argument; it is prompted for with echo off, or piped on standard input.
- **The first account is the administrator.** `create-user` makes an
  administrator when no account exists yet, and a user after that unless it
  is given `--admin`.
- **The rest can be created from the app** (ADR 26). An administrator's account
  screen has a *People* group: add a person with a password they type and hand
  over, change a role, reset a password, disable and enable. The same 12
  character minimum applies; disabling signs the person out everywhere and
  revokes their machine tokens, and the last active administrator can be
  neither demoted nor disabled. Accounts are never deleted.
- **Opaque session tokens** in an `Authorization: Bearer` header — no JWT, no
  cookies. 256 random bits, stored as a SHA-256 hash, revoked by deleting the
  row. The same mechanism works unchanged for the PWA and for the Expo app.
- **scrypt** (`N=2^16, r=8, p=2`, 64 MiB) from `node:crypto`. Argon2id would be
  the better algorithm, but every Node binding for it is a native module, and
  this ships to a homelab box and to multi-arch images.
- **Sessions last 30 days, sliding.** The real control is revocation, which is
  immediate; a short expiry on a phone used in a garage only teaches people to
  pick shorter passwords.
- **Login is rate limited per caller**, read from `CF-Connecting-IP` because the
  socket peer is always the Cloudflare Tunnel. The header is believed only from
  a configured proxy address, so it cannot be forged from the LAN.

## Passkeys

A **passkey** is a second way to open the same session (ADR 19), and the rule
it is built around outranks everything else in this section: **the password
form is always present and always usable.** A passkey is an addition beside
it, never a replacement, and never behind a "use password instead" link.

```
POST   /auth/passkey-login/options   →  { ceremonyId, options }
POST   /auth/passkey-login           →  { token, expiresAt, user }
GET    /auth/passkeys                →  { passkeys }
POST   /auth/passkeys/options        →  { ceremonyId, options }
POST   /auth/passkeys                →  201 { passkey }
DELETE /auth/passkeys/:id            →  204
```

- **It opens the very same opaque session a password does** (ADR 6). Same
  token, same thirty sliding days, same `DELETE` to revoke. There is no second
  kind of session and nothing downstream can tell the difference — except one
  column, `Session.createdWith`, which exists for exactly one rule below.
- **Registering one needs a password-backed session.** A session a passkey
  opened may list devices and remove them, and may not add one. It is ADR 18's
  argument about machine tokens with one word changed: a credential that can
  issue its own successor outlives every password change made to stop it.
  Somebody adding their laptop after signing in on their phone types their
  password once, which is the whole cost.
- **Removing is deliberately easier than adding.** Any session may remove any
  of its own devices, because the person who has just realised a phone is gone
  is holding the other phone, not sitting at a keyboard with their password to
  hand. Nothing is at risk in that direction: removing every passkey cannot
  lock anybody out, because the password form never leaves the sign-in screen.
- **Several per person.** A phone and a laptop are two authenticators, and a
  lost phone must not be a lost account.
- **User verification is required**, on both ceremonies and in the signed
  bytes. A passkey that silently accepted mere presence would be a passkey in
  name only, and the whole point here is the fingerprint. What it costs is an
  old security key with no PIN and no sensor, which is refused with a sentence
  saying so — beside a password form that still works.
- **Sign-in asks for no username.** Credentials are discoverable, the options
  carry an empty `allowCredentials`, and the assertion says who you are. The
  second reason is the stronger one: the options route is unauthenticated, and
  a username-first flow would have to tell an anonymous caller which usernames
  exist and which devices they own.
- **The RP ID and the expected origin are derived** from
  `WAYMARK_PUBLIC_BASE_URL` — its hostname and its origin. There is no
  `WAYMARK_RP_ID`, because two settings that can disagree is one more state
  than this feature has, and the extra state is a deployment that boots
  perfectly and refuses every fingerprint. A base URL that is neither `https:`
  nor a loopback host is refused at boot, by name, because no browser will run
  WebAuthn against it.
- **Challenges are rows: single-use, two minutes, bound to their ceremony.**
  Spending one is a `DELETE` that returns what it deleted, so two requests
  racing the same ceremony cannot both be served, and the ceremony is part of
  the `WHERE` so a registration challenge cannot finish a sign-in.
- **A signature counter that goes backwards is refused, and the device is not
  deleted.** Most authenticators keep no counter at all and always report
  zero, so zero-against-zero means "this one does not count"; anything else
  that fails to climb is treated as a clone and the sign-in is refused, with
  the device named so the person can remove it themselves.
- **What is stored is what verification needs**: the credential id, the public
  key, the counter, the transports, the name the person typed and when it was
  last used. No attestation is requested and no AAGUID is kept, because those
  identify the make and model of somebody's device and there is nothing here
  to do with the answer.
- **A machine token is refused all four managed routes**, including the list.
  A passkey is a person's thumb, and a machine token has no person behind it.

## Machine tokens

A **machine token** is a credential for a program rather than a person
(ADR 17). An MCP server reading the inventory so an assistant can answer "which
box is the drill in" needs a way in, and the alternative was a household
member's password in an environment file: it cannot be revoked without changing
that person's password, nothing records that a machine is using it, and it can
do everything that person can.

```sh
pnpm --filter @waymark/api machine-token create --name mcp-server --scope read
pnpm --filter @waymark/api machine-token create --name filer --scope read-write --expires-in-days 90
pnpm --filter @waymark/api machine-token create --name partner-mcp --scope read --username partner
pnpm --filter @waymark/api machine-token create --name garage-mcp --scope read --space <garage-id> --space <attic-id>
pnpm --filter @waymark/api machine-token list
pnpm --filter @waymark/api machine-token revoke --name mcp-server
```

- **A token belongs to a person** (ADR 26) and will act as them. From the
  account sheet it is the person signed in, and rotating it keeps that
  person, as it keeps the scope. From the shell it is whoever
  `--username` names, or the oldest administrator when nobody is named — and
  with no administrator at all, `create` refuses and says to run
  `create-user` first.
- **A token may be narrowed to chosen spaces, never widened** (ADR 26). Each
  `--space` takes a space's id; the token then reaches what its person can
  reach within those spaces and everything under them, and its scope still
  applies on top. Without any `--space` it reaches everything its person can.
  A space that person cannot see is refused. A narrowed token never acts at
  the top of the tree (no new roots, nothing moved to or from the top), and
  one whose chosen spaces have all been deleted reaches nothing. Rotating it
  keeps its spaces.

The same four operations live behind the avatar in the web client, under
**Machine tokens**. The secret is shown exactly once, with the sentence saying
so beside it rather than after it, and it can be copied — because the
alternative is somebody transcribing 43 random characters by eye and reaching
for a screenshot instead. What that cannot control is written down in ADR 18.

```
Authorization: Machine wmk_hhKABz-fSeDJwWCfiNRkmB9BoSGcv6wrPAhTya7CW28
```

- **Created from a shell, or from the account sheet by a person** (ADR 18).
  The CLI is how the FIRST token is made on a fresh install, before there is an
  account to sign in with, and it is the way in if the web client will not
  load. Both drive the same use cases. ADR 17 said there would never be a route
  for this and was right about the danger — an endpoint that issues a
  LONG-LIVED credential on an internet-facing inventory is a door that does not
  close by itself — but that sentence never said WHO. These routes are behind
  the session ADR 6 built: password backed, rate limited, revocable in one
  DELETE. The cost is named in ADR 18: a stolen session can now mint a
  credential that outlives it. What pays for it is that every credential is now
  visible, with its last use, to the person who issued it and to every
  administrator (ADR 26), who may also rotate and revoke it. The
  secret is shown once and never again either way.
- **Its own `Authorization` scheme**, `Machine`, not a prefix inside `Bearer`
  and not a second header. The scheme is read once and the request goes to
  exactly one authenticator, so a leak of either credential cannot be replayed
  as the other — a session token presented as `Machine` never reaches the
  session table, and a machine token presented as `Bearer` never reaches the
  machine token table. Neither is a lookup that missed; neither lookup happens.
- **Scoped `read` or `read-write`.** A read-only token is refused every write,
  in the hook that authenticated it, before the body is parsed and before any
  use case runs — so a refusal cannot have changed anything. It is a **403**,
  and the reasoning is above and in ADR 17. Two values, and there will not be a
  third: which spaces a token reaches is its issuer's access, narrowed or not.
- **Stored as SHA-256, not scrypt**, which is the opposite of what accounts get
  and is deliberate. A KDF is slow to make GUESSING expensive, and there is
  nothing to guess: the secret is 256 uniform random bits, so an attacker
  holding the hash faces 2^256 either way, and being long-lived changes the
  window rather than the search space. The cost, meanwhile, lands on every
  request a machine makes rather than on one login a month. Caching verified
  tokens would hide that cost and was rejected: a cache of verified credentials
  is a second copy of revocation state, and revocation here is immediate.
- **Revoked one at a time, by name**, touching no human account and no other
  token. A misspelled name exits non-zero rather than reporting success.
- **Records when it was last used**, at most once an hour. A credential nobody
  can see being used is one nobody will ever revoke — and a machine is the one
  caller that reads in a loop, so stamping every request would turn an
  inventory walk into forty writes on a single SQLite file.
- **Outside the login limiter entirely.** It does not log in. That limiter
  exists to make password guessing expensive (ADR 7); a machine token cannot be
  guessed and is the one caller that legitimately makes hundreds of requests a
  minute, so counting it would throttle the integration and catch nobody.
- **A machine token may not manage machine tokens**, with either scope
  (ADR 18). A `read` one never reaches those routes at all: three of the four
  are writes, so the scope hook refuses them before the body is parsed, which
  is what makes "a read key cannot mint a writing one" structural rather than
  remembered. A `read-write` one passes that hook and is refused anyway, with
  403 `MACHINE_TOKEN_CANNOT_MANAGE_MACHINE_TOKENS`, because a credential that
  can issue its own successor cannot be revoked — kill `mcp-server` and whoever
  holds it still has the `mcp-server-2` it minted last Tuesday. Listing is
  refused too, and that one no scope would have caught: a `GET` sails through
  the hook, and enumerating every credential in the house is reconnaissance.
  `POST /auth/logout` already refused a machine caller for the same family of
  reason.
- **Rotation is one operation, never a revoke and a create.** Revoke-then-
  create leaves a window in which the name holds nothing, and a crash inside it
  destroys a live credential with nothing to replace it; create-then-revoke
  cannot be written, because the name is unique and the name is what revocation
  is keyed by. So it is one `UPDATE ... WHERE name = ?`. It keeps the id, the
  name and the SCOPE — rotation must not be a way to widen a key — and it
  resets `lastUsedAt`, which otherwise would report traffic belonging to a
  secret that no longer exists. There is no grace period: a request already
  authenticated finishes, every one after it is a 401 until the new secret is
  in place, and the screen says so before the button.
- `GET /auth/me` answers `{ machineToken }` for one, carrying its name, scope
  and last use — and never its hash, which no route returns.
