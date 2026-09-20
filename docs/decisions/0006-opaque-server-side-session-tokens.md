# 6. Opaque server-side session tokens, created by an admin

- Status: accepted
- Date: 2026-09-20

## Context

Two clients consume the API: a browser PWA and an Expo Android app. The
session has to work identically in both, and the service is internet facing.

## Decision

**Opaque random tokens, stored server side, sent in `Authorization: Bearer`.**

JWT was rejected: it cannot be revoked without reintroducing exactly the
server-side table it claims to avoid, so the stateless benefit is imaginary
here. Cookies were rejected: `httpOnly` is genuinely stronger against XSS in
the browser, but Expo would then need a cookie jar and cross-origin handling,
turning one mechanism into two. One mechanism that revokes instantly beats two
mechanisms that disagree.

Logout deletes the row and takes effect on the very next request.

**No registration endpoint exists.** Accounts are created by an admin through
a CLI command. A public sign-up form on an internet-reachable inventory is an
invitation to fill the database with strangers, and the household has three
people.

**Passwords are hashed with scrypt from `node:crypto`**, not Argon2id. Argon2id
is the better algorithm, but every Node binding for it is a native module, and
this deploys to a homelab box and later to multi-arch images. scrypt is
memory-hard, needs no compilation on any architecture, and is what OWASP
recommends when Argon2id is unavailable. PBKDF2 was rejected as CPU-hard only.
Parameters are stored inside each hash so they can be raised later without
locking anyone out.

**Sessions last 30 days, sliding**, with the renewal write throttled to once a
day. Revocation, not expiry, is the real control. A short expiry on a phone
used one-handed in a garage does not buy security; it teaches people to choose
shorter passwords.

## Consequences

- Revocation is a `DELETE`, and it is immediate.
- The same code path serves web and mobile with no special cases.
- Onboarding someone requires shell access. Intended.
- Raising KDF parameters is safe; there is a test for verifying hashes made
  under older ones.
