# Architecture

One API, two clients, one origin. The domain knows nothing about HTTP, React,
or SQL.

```
packages/domain        Entities, use cases, ports. Zero dependencies.
packages/domain-contract-tests  Shared contract suites every adapter of a port
                       must satisfy. Run against the in-memory repositories and
                       against the real ones.
packages/api-client    What the API promises and the one module that speaks
                       HTTP, shared by both clients. Zero dependencies, no
                       React, no platform.
apps/api               Fastify + Prisma. Adapters that implement the ports, the
                       HTTP layer, authentication, and the built web client.
apps/web               React + Vite PWA. The tree, search, photos, QR scanning.
apps/mobile            Expo (React Native). Android app.
apps/mcp               MCP server over stdio. The inventory as an assistant
                       reads it, behind a machine token.
services/image-processor  rembg sidecar. Optional background removal.
docker/                The image — API and web client — and its entrypoint.
docs/decisions/        Architecture decision records.
```

## Key decisions

**The API serves the web client, from one origin** (ADR 16). One image, one
container, one hostname on the tunnel, and no CORS between the browser and the
API — a same-origin request is not a cross-origin one. The two halves are
versioned together and have never been deployed apart, so the image builds
`apps/web` in its own stage and copies only `dist` into the runtime; a compose
file that could bring up an API and a client from different commits would have
exactly one interesting state, the mismatched one.

The cost is that one origin has one namespace. An unmatched path falls through
to the app shell, and the rule that stops that swallowing an API path is that
the first segment must not be one the API claims — a set derived from Fastify's
own route table rather than kept by hand. An API path that no longer exists
answers `404 application/json`; handed `200 text/html`, a client reports
"unexpected token < in JSON", which is a sentence about a parser and sends
somebody to the wrong layer for an hour.

**SQLite behind a port.** Storage starts as SQLite because the whole point is a
single small container in a homelab. The repository is a port, so moving to
Postgres later is an adapter swap, not a rewrite.

**Image processing is an optional adapter.** `rembg` pulls in Python and a
~180MB ONNX model. It does not belong in the API process. It runs as its own
container behind an `ImageProcessor` port. If the sidecar is down or switched
off, items still save with their original photo and can be reprocessed later. A
secondary feature must never be able to block the primary one.

**Background removal is driven by a polling worker, not a broker** (ADR 10).
The queue IS the photo table: a photo waiting to be processed is a row that says
`PENDING`. A broker would be a second copy of that truth to keep in step, and
the classic failure of that shape is this feature's — the row says `PENDING`,
the job was lost on a restart, and nothing notices. Claims take a lease, so no
photo is processed twice and no photo is lost with the process that died holding
it.

**Search is an FTS5 index the database keeps honest** (ADR 11). Accent
folding cannot be written as a SQL predicate, so the alternative to an index
was loading the whole inventory into the process on every keystroke. The cost
of an index is that it can go stale, and a stale search index does not fail —
it quietly stops finding a box. That cost is paid with triggers rather than
with application code: nine of them rebuild the index inside the same
transaction as the write that changed the row, so no write path can skip it. A
test writes straight into the tables with raw SQL and then searches.

Ranking is NOT in the index. It lives in the domain, because it is product
judgement — a name beats a tag beats a description — and because bm25 scores
are the one thing the in-memory repository and the real adapter could never be
made to agree on.

**Editing is a `PATCH` whose field list cannot move anything** (ADR 14). The
first requirement said a unit's information must be consultable at any time
AND editable; for a long time it was not, and a typo in a box name was
permanent — with a printed label already glued to the box, delete-and-recreate
is a trip to the garage with a printer. A name, a kind, a description, a
quantity and a set of tags are plain attributes with no rule beyond the field
itself, so one patch beats five named operations. Where a thing IS is not one
of them: the patch schemas are strict and carry no `parentId` and no
`storageUnitId`, so the guards that matter — the subtree invariant (ADR 2) and
the all-or-nothing batch move (ADR 3) — stay behind routes whose names say
what they do.

**Every item is one unpaginated request** (ADR 15). `GET /items` answers
every item its caller can see (ADR 26), each row carrying the same breadcrumb a search hit does,
because a flat list of names answers nothing in a product about knowing where
things are. It is unpaginated for the reason ADR 1, ADR 11 and ADR 12 already
gave: a homelab inventory is small enough to read whole, and the honest answer
to one that is not is search, which takes a limit.

**A machine token is a smaller key, not a role** (ADR 17). An MCP server needs
a credential, and a person's password in an environment file is not one: it
cannot be revoked without signing that person out of their own phone. ADR 5
refused roles and permissions, and a `read` scope was on its face the check it
refused — so ADR 17 said that plainly rather than waving it away. ADR 26 has
since given people roles and shares; a token still has only its two scopes,
acts as the person who issued it, and may be narrowed to chosen spaces but
never widened. The thing holding a machine token is not a person, cannot be
told to be careful, and cannot be asked afterwards what it was thinking.

**A person issues machine tokens; a machine never does** (ADR 18). They can be
listed, made, rotated and revoked from the account sheet now, because a
credential nobody can SEE is a credential nobody revokes — `lastUsedAt` existed
to make an abandoned one visible and was visible only to whoever could reach a
shell. ADR 17's "there is no route" is amended rather than overturned: still no
sign-up, still nothing unauthenticated, still the CLI for the first token on a
fresh install, and a machine token is refused all four operations. A credential
that can issue its own successor cannot be revoked, and revocation is the whole
of what ADR 17 promised.

**A passkey is an additional door, never a replacement** (ADR 19). The owner
signs in on a phone, and Chrome on Android hands a web page the fingerprint
reader through WebAuthn — so it does. What makes this safe to add is the rule
it is built around: the password form is on the sign-in screen at all times,
in full, with no "use password instead" link in front of it, and the passkey
button appears only when the platform can actually serve one. A wet thumb, a
cut finger or a freshly rebooted phone must never be why somebody cannot get
into their own garage.

It is the one place this codebase's instinct against dependencies is wrong.
Verifying an attestation and an assertion means CBOR, a COSE key, a client
data hash and a signature over exactly the right bytes, and a subtle mistake
there does not fail — it silently accepts something it should not. So
`@simplewebauthn` does that, and ADR 19 is the argument for it.

Three things follow, and each is a rule rather than a preference. A passkey is
registered only from a session a PASSWORD opened, because a credential that
can issue its own successor outlives every password change made to stop it —
ADR 18's sentence about machine tokens with one word changed. The RP ID and
the expected origin are derived from `WAYMARK_PUBLIC_BASE_URL` rather than
configured beside it, so there is no second setting to disagree with the
first, and a base URL no browser will run WebAuthn against stops the process
at boot. And removing every passkey is allowed, with no warning and no rule
against it, because there is no state in which one is the only way in.

**The icons come from one family; the mark does not** (ADR 20). The icon set
used to be drawn by hand, under a rule written inside the file itself: no
library, because there are ten symbols and the smallest package is hundreds of
kilobytes. Both halves of that failed. Ten was not enough — a vocabulary too
thin to say "copy" is why two features in a row shipped a full-width word
button where an icon belonged — and "hundreds of kilobytes" measured the
package on disk rather than the bundle, which turns out to be 2.48 kB gzipped
for twenty-one icons.

Neither is what decided it. `lucide-react` and `lucide-react-native` are
published in lockstep from one design source, so the two clients cannot draw
the same name differently — which is the thing two hand-maintained files could
never promise, and the strongest argument that had been FOR drawing them here.
`ui/atoms/icon.tsx` stays the seam in both clients: screens ask for a name out
of this product's vocabulary and nothing outside that file knows lucide exists.
The mark is not lucide's either. It is the name with the corner square of a QR
code turned into a pin over its w — the label on the box is the place you are
looking for — and its outlines live once, in `packages/tokens/src/mark.ts`:
the whole logo in the top bar of both clients, and `pinnedW`, the cut with a
solid pin, at icon size. ADR 24 says why it replaced the three rings, which
turned out to be very nearly lucide's own `waypoints`.

**Expo instead of native Kotlin.** Expo lets the Android app share
`packages/domain` and the API client with the web app, in one language, with no
Android Studio in the build path. Native Kotlin would mean two independent
implementations of the same domain.

That sharing is `packages/api-client`, and it is a fact rather than a plan: the
contract types, the error kinds and the 409/422 split, the module that speaks
HTTP, the reader that turns a scanned code into a unit, and the sentences a
refusal becomes are one copy, consumed by both. Three things are deliberately
not in it — React, where the session token lives, and what a photo IS on its
way up — because each of those is genuinely two behaviours, and an abstraction
over two behaviours is a lie in one of them.

**QR codes are generated on demand, not persisted.** A symbol is a pure function
of the unit's `publicId` and the configured public base URL, so storing one only
buys a picture of a dead URL the day the base URL moves — silently, until
somebody scans a box in a garage and gets a connection error. The stable thing is
the `publicId` glued to the box; the picture of it is a rendering. Served as PNG
and SVG at error correction level Q, which is what a scuffed sticker needs.

**Photo files live on a plain directory**, bucketed into 256 subdirectories, with
nothing in SQLite but the row that points at them. Every upload is validated by
sniffing its bytes, re-oriented, stripped of EXIF and thumbnailed before a byte
reaches disk.

**Photo order belongs to the item, not to the photo** (ADR 9). A photo is a file
and a processing state; the order is a property of the relationship, which is why
it lives on the join table and nowhere else. The cover is `photos[0]`, not a
field, so choosing one is spelled as a reorder.

# Stack

- pnpm workspaces
- TypeScript everywhere
- Fastify, Prisma, SQLite (FTS5 for search)
- sharp for image ingestion, qrcode for label symbols
- `@simplewebauthn/server` and `@simplewebauthn/browser` for passkeys (ADR 19)
- `lucide-react` and `lucide-react-native` for the icon set (ADR 20)
- React + Vite (PWA), `@zxing/browser` for scanning
- Expo / React Native, React Navigation, `expo-camera` for scanning
- Python + rembg (sidecar only)
- Docker Compose
