# Waymark

Self-hosted inventory for a home / homelab: register storage units (drawers,
boxes, shelves, crates), record the items inside them, and find anything again
by scanning a QR code or searching by name, unit, or location.

**Find your way back.**

A waymark is the marker a walker leaves on a trail so the route can be
retraced. Stick one on a box and the box has an address.

### Why the name changed

This was called **Ariadna** until it was renamed, after the thread that leads
out of the labyrinth: the house was the labyrinth and the app was the thread.
That reading was not wrong, but it was a metaphor — it needed a myth to
explain itself, it cast the house as an adversary, and the thread is the one
part of the story that is not a thing you leave behind on purpose.

A waymark is not a metaphor. It is a physical marker, left deliberately, so
that somebody can find their way again — which is exactly and literally what a
printed QR label glued to a box is. The name stopped describing the product by
allusion and started describing it by definition, and that is why it is
better.

The rename was done while the inventory was still empty and no label had been
printed. It would not have been free afterwards: a printed `publicId` is glued
to a box, so the id scheme and the `/u/<publicId>` address it resolves through
were deliberately left untouched by the rename and will stay untouched.

## Problem

Things get stored and then lost. Not lost as in gone, lost as in "it is
somewhere in one of forty boxes". Waymark makes every storage unit addressable
via a printed QR code and every item searchable.

## Scope

**Storage units** — name, location, description, photo, generated QR code.
**Items** — name, description, one or more photos, and a parent storage unit.
Items can be created, deleted, and moved between units.

## Architecture

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

### Key decisions

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

**Every item is one unpaginated request** (ADR 15). `GET /items` answers the
whole inventory, each row carrying the same breadcrumb a search hit does,
because a flat list of names answers nothing in a product about knowing where
things are. It is unpaginated for the reason ADR 1, ADR 11 and ADR 12 already
gave: a homelab inventory is small enough to read whole, and the honest answer
to one that is not is search, which takes a limit.

**A machine token is a smaller key, not a role** (ADR 17). An MCP server needs
a credential, and a person's password in an environment file is not one: it
cannot be revoked without signing that person out of their own phone. ADR 5
refused roles and permissions, and a `read` scope is on its face the check it
refused — so ADR 17 says that plainly rather than waving it away. What makes it
worth paying is that ADR 5's reasons are about PEOPLE and all of them still
hold: no owner column, no query scoped by anybody, and every authenticated human
may still do everything. The thing holding a machine token is not a person,
cannot be told to be careful, and cannot be asked afterwards what it was
thinking.

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
The mark — `waypoints`, the three rings in the top bar — is still drawn by
hand, because the picture that means Waymark may not also mean "routing" in a
thousand other products.

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

## Stack

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

## HTTP API

Everything but `GET /health`, `POST /auth/login` and the two
`POST /auth/passkey-login` routes needs a session — or a machine token
(ADR 17), which is a credential for a program rather than a person and travels
under its own `Authorization` scheme. The passkey sign-in routes are
unauthenticated for the same reason the login is: they are how a session
begins. They take no username, and they answer the same thing to everybody.

These paths are the API's half of the origin (ADR 16). Anything else that no
route matches is the web client's, and is answered with the app shell — but
only for a `GET` or a `HEAD`, and only when it is a real file or a path with
no file extension. A sub-path of any row below is JSON, a missing `.js` is
JSON, and a write to a path nothing serves is JSON.

| Method   | Route                       | Answers                                      |
| -------- | --------------------------- | -------------------------------------------- |
| `GET`    | `/health`                   | `{ status, commit }` — `commit` is which one is running (ADR 23) |
| `POST`   | `/auth/login`               | `{ token, expiresAt, user }`                 |
| `GET`    | `/auth/me`                  | `{ user }`, or `{ machineToken }` for a machine |
| `POST`   | `/auth/logout`              | `204` — a session only; a machine token gets 403 |
| `POST`   | `/auth/passkey-login/options` | `{ ceremonyId, options }` — no session, no username |
| `POST`   | `/auth/passkey-login`       | `{ token, expiresAt, user }` — the same session a password opens |
| `GET`    | `/auth/passkeys`            | `{ passkeys }` — your own devices, never anybody else's |
| `POST`   | `/auth/passkeys/options`    | `{ ceremonyId, options }` — needs a password-backed session |
| `POST`   | `/auth/passkeys`            | `201 { passkey }` — needs a password-backed session |
| `DELETE` | `/auth/passkeys/:id`        | `204` — one device, any session                |
| `GET`    | `/search`                   | `{ query, terms, items, storageUnits }`      |
| `GET`    | `/storage-units`            | `{ tree }` — the whole forest, nested        |
| `POST`   | `/storage-units`            | `201 { unit }`                               |
| `GET`    | `/storage-units/:id`        | `{ unit, path, children, items }`            |
| `PATCH`  | `/storage-units/:id`        | `{ unit }` — name, kind, description         |
| `POST`   | `/storage-units/:id/move`   | `{ unit }` — body `{ parentId }`             |
| `POST`   | `/storage-units/:id/empty`  | `{ movedItems, movedChildUnits }`            |
| `DELETE` | `/storage-units/:id`        | `204`                                        |
| `GET`    | `/items`                    | `{ items }` — every item, each with its path |
| `POST`   | `/items`                    | `201 { item }`                               |
| `GET`    | `/items/:id`                | `{ item, storageUnit, path }`                |
| `PATCH`  | `/items/:id`                | `{ item }` — name, description, quantity, tags |
| `POST`   | `/items/move`               | `{ items }` — body `{ itemIds, targetUnitId }` |
| `DELETE` | `/items/:id`                | `{ releasedPhotoIds }` — and the files go     |
| `GET`    | `/storage-units/:id/qr.png` | A QR encoding `<base>/u/<publicId>`          |
| `GET`    | `/storage-units/:id/qr.svg` | The same symbol, for printing                |
| `POST`   | `/storage-units/:id/photo`  | `201 { photo, unit, releasedPhotoIds }`      |
| `DELETE` | `/storage-units/:id/photo`  | `{ unit, releasedPhotoIds }`                 |
| `POST`   | `/items/:id/photos`         | `201 { photo, item }` — multipart `file`      |
| `POST`   | `/items/:id/photos/order`   | `{ item }` — body `{ photoIds }`, first is cover |
| `DELETE` | `/items/:id/photos/:photoId`| `{ item, releasedPhotoIds }`                 |
| `GET`    | `/photos/:id`               | The image, streamed                          |
| `GET`    | `/photos/:id/thumbnail`     | The small one, for list screens              |
| `GET`    | `/photos/processing`        | `{ processor, counts, abandoned }`           |
| `POST`   | `/photos/:id/reprocess`     | `202 { photo }` — back to `PENDING`          |
| `POST`   | `/photos/processing/retry`  | `202 { requeued }` — every `FAILED` photo    |

`PATCH` changes what a thing SAYS about itself; move and empty stay named
operations because they change what it IS (ADR 14). The line is held by the
schema rather than by discipline: the patch bodies are strict and carry no
`parentId` and no `storageUnitId`, so a request that tries to rename and move
in one call is refused with a 400 naming the key. Ignoring it would be the
worse failure — a client would believe it had moved a box.

`GET /items` answers the whole inventory in one request, unpaginated, and
every row carries its breadcrumb (ADR 15). A flat list of names answers
nothing in a product about knowing where things are, and the honest answer to
an inventory too large to list is search rather than a page.

### Domain errors are mapped, never left to fall through

| Domain error                    | Status | Reason                                              |
| ------------------------------- | ------ | --------------------------------------------------- |
| `StorageUnitNotFound` (in URL)  | 404    | The addressed resource is not there.                 |
| `StorageUnitNotFound` (in body) | 422    | The route exists; a value in the request names nothing. |
| `ItemNotFound`                  | 404/422| Same rule.                                           |
| `StorageUnitNotEmpty`           | 409    | Refused by the state of the unit (ADR 3).            |
| `CyclicStorageUnitMove`         | 409    | Refused by the shape of the tree (ADR 2).            |
| `MissingEmptyTarget`            | 422    | The request is incomplete.                           |
| `InvalidQuantity`               | 422    | Valid JSON, value the domain refuses.                |
| `TooManyItemPhotos`             | 409    | Refused by the current contents of the item.         |
| `PhotoNotOnItem`                | 422    | The request names a photo the item does not hold.    |
| `InvalidMachineToken`           | 401    | Unknown, revoked, expired, or not shaped like one.   |
| `ReadOnlyMachineToken`          | 403    | Authenticated, and not allowed to change anything.   |

409 means "fix the world, then retry": the same bytes succeed once somebody
empties the box or moves the target out of the subtree. 422 means "fix the
request": nothing anybody else does will make these exact bytes work. A test
walks every `DomainError` the domain exports and fails if one has no entry in
the table, so an unmapped error can never become an accidental 500.

A read-only machine token refused a write is deliberately **neither** of those
two codes. The request bytes are correct and the world is correct — the
identical call succeeds the moment a read-write token makes it — so both "fix
the world" and "fix the request" would be advice the caller cannot act on. What
has to change is the CREDENTIAL, and 403 is what RFC 9110 has for "understood,
authenticated, refused to authorize". 401 would be wrong too: it means
"authenticate", and this caller already did (ADR 17).

## Search

The feature the product is named after. Things get stored and then lost — not
lost as in gone, lost as in "it is somewhere in one of forty boxes" — and this
is the way back to them when there is no label in front of you to scan.

```
GET /search?q=cab&within=<unitId>&limit=20
```

```json
{
  "query": "cab",
  "terms": ["cab"],
  "items": [
    {
      "item": { "id": "...", "name": "HDMI 2.1", "tags": ["cables"], "...": "..." },
      "path": [{ "name": "Garage", "...": "..." }, { "name": "Box 3", "...": "..." }],
      "location": "Garage > Box 3",
      "matchedFields": ["TAG"]
    }
  ],
  "storageUnits": [
    {
      "unit": { "id": "...", "name": "Caja de cables", "...": "..." },
      "path": [{ "name": "Garage", "...": "..." }, { "name": "Caja de cables", "...": "..." }],
      "location": "Garage > Caja de cables",
      "matchedFields": ["NAME"]
    }
  ]
}
```

- **Every result carries its breadcrumb.** That is the whole point: "you own a
  cordless drill" is something the person already knew. `path` is the units
  themselves, so a client can make each step tappable; `location` is the same
  path already joined, so a list row does not have to.
- **Items and storage units are two lists**, not one. They answer two
  different questions — "where is my drill" and "where is Box 3" — and
  interleaving them would need a made-up rule for whether a box called
  `Cables` beats an item tagged `cables`.
- **Items match on name, tags and description**; units match on name.
  Searching `cables` finds an item called `HDMI 2.1` that is tagged `cables`,
  which is the entire reason tags are worth having.
- **Accents do not matter, in either direction.** `camara` finds `cámara` and
  `cámara` finds `camara`. The query and the stored text are folded by the
  same rule, so the comparison never sees an accent. `ñ` folds to `n` for the
  same reason.
- **A term matches the start of a word**, so `cab` finds `cables` before the
  word is finished.
- **Every term is required.** `cable usb` does not match a cable that is not
  USB.
- **`within` is a subtree, at any depth.** A location IS a storage unit
  (ADR 1), so "search the garage" means everything under it, four levels down
  included. An item held directly by the garage is in the garage; the garage
  itself is not a result, because a box is not inside itself. A `within` that
  names nothing is a 422 — the id came from the query string, not the path.
- **An empty `q` answers with nothing**, never with everything. A search page
  nobody has typed into yet is not a request to dump the inventory.

### The order, and why

A **name** beats a **tag** beats a **description**: a name is what somebody
deliberately called a thing, a tag is a label they deliberately put on it, a
description is prose that happens to mention a word. A whole word beats a word
the query merely starts. A match spread over several fields — `cable video`
finding `Cable HDMI` tagged `video` — ranks below all three, because neither
field answers the query on its own. Name and id break the remaining ties, so
two reads of an unchanged inventory never come back shuffled.

`matchedFields` ships with every result so a client can say WHY it is there.
The relevance score does not: the order is the promise, and a number clients
could re-sort by would freeze a ranking rule that is meant to improve.

The ranking is computed in `packages/domain`, from the entities, and not by
the index. bm25 is a number that depends on how many other rows happen to
contain the word, and it is the one thing the in-memory repository and the
Prisma adapter could never have been made to agree on — which would have put
the most important half of this feature outside the contract suite.

## QR codes

Every storage unit has a `publicId`: ten characters of Crockford Base32, printed
under the symbol so it can be read aloud across a garage. The QR itself encodes
`<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>` — a URL, never a bare id, because
Android's stock camera offers to OPEN a URL and offers to copy a string, and
"install the app, open it, then scan" is the workflow the label exists to avoid.

Error correction is **level Q**, 25%. L is sized for a symbol on a screen and one
scuff turns the label into decoration. H is not simply better: more redundancy
means a larger symbol, so at a fixed sticker size every module gets smaller until
the camera stops resolving them. A test scrubs out a square of the symbol and
asserts Q still decodes where both L and M lose the URL.

### The label sheet

One label at a time is a workflow that never happens: open the box's screen,
open its label, print, go back, sixty times. So `/labels` in the web client
prints a sheet, and the real job — label the whole storage room in one
afternoon — is tick a room, print, cut, stick.

**A label is not just a QR.** Standing in front of twenty boxes, a wall of
identical squares means scanning every one of them; a name means reading the
wall. So the name is first and biggest, then the symbol, then the `publicId`
for the day a label is scuffed past what level Q can recover, then where the
unit lives — small, and not for the person holding the box but for the ten
minutes between the printer and the glue, when twelve cut-out squares have to
be matched to twelve boxes, three of which are called `Box 3`. The KIND is
left off: "Box" on a label glued to a box costs a line and tells nobody
anything they cannot see.

**Which units** is a selection, a subtree, or both. "Everything inside the
garage" is one press because a location IS a storage unit (ADR 1) and the
forest the app already loads makes the subtree free; `?within=` from a unit's
own screen means what it means on a search — inside, not the unit itself
(ADR 11). Printing all sixty every time would be as useless as printing one.

**Plain A4 and scissors**, no proprietary label stock. 10mm side and 12mm
top/bottom margins leave 190 × 273mm, which is 3 × 4 labels of 63 × 68mm. That
count is a scanning decision, not a packing one: the payload is around 35
characters, which at level Q is a 33-module symbol plus its quiet zone, 41
across, and printed at 36mm that is 0.88mm per module — comfortably past the
~0.4mm where phone cameras give up, with a long hostname still leaving 0.73mm.
Eighteen to a page matches an off-the-shelf label sheet and was rejected: the
cell is then 46mm tall, and either the symbol or the name has to give.

The pages are chunked in code rather than left to the printer. `break-inside:
avoid` stops one label being cut in half but not a whole row being pushed onto
the next page, and a preview that disagrees with the paper is worse than no
preview. Twelve to a page, the break between them, so the preview IS the
pages — shown at real size, in a container that scrolls sideways on a phone.

A sheet will not print until every symbol has been fetched. Each one is behind
the session like every other image, and a print dialog opened with three still
in flight puts blank squares on paper that somebody then cuts up.

## Photos

A storage unit holds at most one photo; an item holds up to ten, ordered, first
one is the cover. Files live on `WAYMARK_PHOTO_ROOT`, a plain directory mounted
as a Docker volume — no S3, no MinIO, and no blobs in SQLite, which would turn
the one file you want small enough to copy anywhere into tens of gigabytes.

- **The bytes decide the format, never the header.** `Content-Type` is a string
  the client picked about bytes the same client picked. Signatures are sniffed,
  and only JPEG, PNG and WebP are accepted. SVG is refused because it is a
  document that happens to draw.
- **EXIF is stripped, orientation first.** Phone photos carry GPS, and this
  service is internet-reachable and serves the photos back. The order matters: a
  phone held upright records landscape pixels plus a tag saying "turn me", so
  stripping the tag before honouring it leaves every portrait photo sideways.
- **A thumbnail is written at upload.** A grid of 200 items over mobile data is
  the first screen anybody opens.
- **Serving needs a session**, streams instead of buffering, and is cached
  `private` — never `public`, because a shared cache must not hold the inside of
  a house. A stored file never changes, so thumbnails and settled photos are
  `immutable`; the one exception is a photo still waiting for its background to
  be removed, where the same id is about to start serving a different file, so
  it revalidates instead (ADR 10).
- **A thing carries its photos, not their ids.** `ItemView.photos` is a list
  of whole `PhotoView`s, ordered, first one is the cover, and a unit's own
  screen answers with `unit.photo` — so no client builds a `/photos/:id` by
  hand, and every screen can say which picture is still waiting for a
  background removal that may never happen.

  A photo appears only where a unit is the SUBJECT of the answer: its own
  screen, a patch, a move, an upload. A breadcrumb step, a child row, a node
  of the tree and a search hit are rows about somewhere else, and they carry
  no photo — and no photo id either, because an id is not a picture. It
  cannot be drawn without building a URL and it says nothing about whether
  the bytes have settled, so the field could only ever be used wrongly. The
  rows got smaller rather than larger.
- **Deleting releases the files.** The rows go first, then the files, and a
  failed unlink is logged rather than thrown. A read-only volume must not make
  deleting an item impossible; a file with no row costs disk, a lost delete is a
  lie to the user.

## Background removal

Optional, out of process, and unable to break anything (ADR 4, ADR 10). With
`WAYMARK_IMAGE_PROCESSOR_URL` unset there is no processor, no worker and no
timer: photos are uploaded, stored and served from their originals, and every
one of them sits at `PENDING` until a sidecar appears. That is a complete
installation.

With a sidecar, an upload still answers `201` immediately and the work happens
afterwards:

1. The photo is written and saved as `PENDING`. Nothing on the request path
   ever calls the sidecar.
2. A worker claims it — one at a time by default — reads the original, posts the
   bytes to `POST /remove`, and gets back a cutout with an alpha channel.
3. The cutout is composited onto **white**, not left transparent, and stored as
   a JPEG beside the original. A transparent PNG on a dark themed phone shows
   the inside of a box on black.
4. The photo becomes `DONE` and `GET /photos/:id` starts serving the new file.
   It is the one URL in this API whose bytes can change, so it revalidates while
   `PENDING` and is `immutable` afterwards.

**What happens when it goes wrong** is the whole design. A sidecar that is down,
timing out, overloaded or answering nonsense is a statement about the SIDECAR:
the photo stays `PENDING` and is retried after 1, 2, 4 then 8 minutes, capped at
30, five times. A `4xx` is a statement about the BYTES — the decoder read them
and refused — so the photo is `FAILED` immediately, because the same bytes will
be refused identically for ever. A `204` means "nothing to remove" and the photo
is `SKIPPED` and never asked again.

`GET /photos/processing` answers whether the sidecar is configured and
reachable, how many photos are in each state, and which were abandoned with the
reason and the attempts spent — so neither question needs SSH and a SQL client.
`POST /photos/:id/reprocess` and `POST /photos/processing/retry` put photos back
in the queue and forget their attempts.

All three have buttons. A photo whose removal failed says so under the picture,
with a retry beside the sentence and a link to `/processing` in the web
client, which is where somebody who has just met one failure looks for the
rest. That screen is deliberately not in the bottom navigation: a tab for an
optional secondary feature would be this app disagreeing with ADR 4 in the
place people look most. `GET /health` is deliberately untouched
by all of this: it answers `ok` while background removal is broken, behind or
switched off, which is exactly what "optional" has to mean.

| Variable                                  | Default  | What it decides                                    |
| ----------------------------------------- | -------- | -------------------------------------------------- |
| `WAYMARK_IMAGE_PROCESSOR_URL`             | _unset_  | The sidecar's address. Unset switches the feature off. |
| `WAYMARK_IMAGE_PROCESSOR_TIMEOUT_SECONDS` | `120`    | When one removal is abandoned as hung.              |
| `WAYMARK_IMAGE_PROCESSOR_CONCURRENCY`     | `1`      | Photos in flight at once. rembg already uses every core. |
| `WAYMARK_IMAGE_PROCESSOR_MAX_ATTEMPTS`    | `5`      | Attempts before a photo is left `FAILED`.           |
| `WAYMARK_IMAGE_PROCESSOR_POLL_SECONDS`    | `15`     | How often work is looked for when no upload woke it. |

## Authentication

One shared inventory. Users are credentials, not tenants: there is no owner
column, no per-user scoping and no roles. Everybody who can log in sees and
edits the same house.

There are three kinds of credential: a password, a passkey (ADR 19) and a
machine token (ADR 17). The first two open the same session for a person; the
third is not a person at all.

- **No sign-up, ever.** Accounts are created from a shell on the server with
  `pnpm --filter @waymark/api create-user`. The password is never an argument;
  it is prompted for with echo off, or piped on standard input.
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

### Passkeys

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

### Machine tokens

A **machine token** is a credential for a program rather than a person
(ADR 17). An MCP server reading the inventory so an assistant can answer "which
box is the drill in" needs a way in, and the alternative was a household
member's password in an environment file: it cannot be revoked without changing
that person's password, nothing records that a machine is using it, and it can
do everything that person can.

```sh
pnpm --filter @waymark/api machine-token create --name mcp-server --scope read
pnpm --filter @waymark/api machine-token create --name filer --scope read-write --expires-in-days 90
pnpm --filter @waymark/api machine-token list
pnpm --filter @waymark/api machine-token revoke --name mcp-server
```

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
  visible, with its last use, to everybody who could have minted one. The
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
  and the reasoning is above and in ADR 17. Two values, and a third would be
  the role system ADR 5 refused.
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

## Web client

`apps/web`. React, Vite, TypeScript, installed as a workspace package and
served **by the API, from the API's own origin** (ADR 16). One container, one
hostname, and no CORS for this client at all — a same-origin request is not a
cross-origin one, so `WAYMARK_ALLOWED_ORIGINS` is empty in a normal
deployment and exists only for a browser client served from somewhere else.

```
src/auth       Signing in, passkeys, the session, and the gate every other screen sits behind.
src/units      The tree, one unit, create / edit / move / empty / delete, labels.
src/items      One item, adding, editing, bulk move, delete, and everything you own.
src/search     The screen the product is named after.
src/scanning   The camera, and the `/u/<publicId>` a label opens.
src/photos     Uploading, ordering, and drawing a picture that needs a session.
src/api        The only place that speaks HTTP: the client, the contract, the errors.
src/ui         atoms / molecules / organisms — the shared visual vocabulary.
src/app        The composition root: providers, the route table, the shell.
```

**Where the API uses the resource name, this app uses the shorter human
word**, because one origin has one namespace and a path belongs to exactly one
of them. `/units/:id` was already that, for `GET /storage-units/:id`; so are
`/things` and `/things/:id` for `GET /items`, `/find` for `GET /search`, and
`/processing` for `GET /photos/processing`. The labels on screen did not
change — these are addresses, and the reason they changed is in ADR 16. `/`
and `/u/:publicId` are contracts and cannot move: one is the manifest's
`start_url` and the other is glued to boxes (ADR 12).

That is data with a test on it. `src/app/routes.ts` is the whole table, the
router and every link are built from it, and `src/app/routes.test.ts` refuses
any screen named after a path the API owns — because the failure is nearly
invisible. A browser opening `/items` is handed JSON, but only on a COLD load:
once the service worker is installed, `navigateFallback` draws the shell from
the cache and the screen works. The only person who ever meets it is somebody
following a link for the first time. `src/app/api-namespace.ts` holds the
API's segments for the same reason, and hands Workbox the denylist that keeps
the service worker from answering them either.

The top level names what the app DOES. Inside a feature, the split is between
containers, which fetch and orchestrate, and views, which take props and
draw — so every view is testable with no network at all, and every screen has
exactly one place that knows about requests.

**No business rules live here.** The client never checks whether a box is
empty before deleting it, and the move picker deliberately offers targets
that would make a cycle. Those rules are the domain's (ADR 2, ADR 3), the API
enforces them, and this app renders the answer — including the refusal. What
it does carefully is tell the two kinds of refusal apart: a 409 is about the
WORLD and comes with a button that changes it ("empty it into Metal wardrobe
and delete"), a 422 is about the REQUEST and lands next to the field that
caused it (ADR 8). Editing follows the same rule and picks the tone from the
failure KIND rather than from a list of codes, so a refusal nobody has met yet
still lands in the right box.

**Editing and moving are separate buttons**, on the unit screen and on the
item screen, because they are separate acts and only one of them can make the
inventory lie about where something is (ADR 14).

- **Mobile first.** Tap targets of 48px and up, navigation at the bottom
  where the thumb is, sheets that slide up from the bottom rather than
  dialogs in the middle, safe-area insets, and a dark theme by default
  because half of this happens in a storage room at night.
- **Every image is fetched with the session.** `GET /photos/:id` and the QR
  routes are behind the bearer token, so a plain `<img src>` would answer
  401; the bytes are fetched like any other request and handed to the DOM as
  an object URL, revoked when the element goes.
- **A photo is shown the moment it is stored.** Background removal is
  optional, out of process and may never happen (ADR 4). Nothing waits for
  `DONE`.
- **A scanned label works for somebody who is not signed in yet**: the gate
  carries the destination into the login screen and back out of it. The code
  is resolved against the forest the app already loads (ADR 12).
- **Installable, and honest about offline** (ADR 13): the shell, the photos
  already seen, the forest of units and every item are cached, so both
  screens that answer "what do I own" draw with no signal. A search, one
  unit, one item and the background-removal summary are deliberately never
  cached — the reasons are in the ADR, and the list is data with a test on it
  in `src/app/pwa-caching.ts` rather than a literal in the build file. No
  write is ever queued for later.

Tests drive the real app through the DOM and stub the network at the HTTP
boundary with MSW. Nothing in `src` is ever mocked — a test that replaced the
app's own fetch wrapper would prove the wrapper was called and say nothing
about the contract with the API. The one exception is the camera, which is a
port with a ZXing adapter, because jsdom has no pixels.

```sh
pnpm --filter @waymark/web dev      # http://localhost:5173
pnpm --filter @waymark/web test
pnpm --filter @waymark/web build
```

`VITE_WAYMARK_API_URL` says where the API is, as a browser sees it. It
defaults to **nothing at all**, which makes every request relative and
therefore same-origin: the API serves this bundle, so the host to call it on
is the host it was downloaded from. A deployed bundle carries no build-time
hostname, so one image serves whatever the tunnel is called and moving the
tunnel is not a rebuild.

Set it for `pnpm --filter @waymark/web dev`, which serves the app on
`:5173` against an API on its own port — `http://127.0.0.1:3000` is where
`pnpm --filter @waymark/api dev` listens. That is a genuine cross-origin
browser client, and it is the one caller `WAYMARK_ALLOWED_ORIGINS` is still
for: put `http://localhost:5173` in it while developing that way.

## Android app

`apps/mobile`. Expo and React Native, sharing `@waymark/api-client` and
`@waymark/domain` with the web PWA as TypeScript source — no build step
between them, which is the whole reason Expo was chosen over Kotlin.

```
src/auth       Signing in, the session in the keystore, and the gate.
src/units      The tree, one unit, create / edit / move / empty / delete, the label.
src/items      One item, adding, editing, moving, deleting, everything you own.
src/search     The screen the product is named after.
src/scanning   The camera, and the `/u/<publicId>` a label encodes.
src/photos     Taking one, choosing one, uploading, ordering.
src/api        The mobile half of the shared client, and the React wiring.
src/ui         atoms / molecules / organisms — the shared visual vocabulary.
src/app        The composition root: ports, providers, the navigators.
```

The top level names what the app DOES, the same way `apps/web` does, and
inside a feature the split is the same: containers fetch and orchestrate,
views take props and draw. **No business rules live here.** The move picker
offers targets that would make a cycle and the delete does not pre-check
emptiness; those are the domain's (ADR 2, ADR 3) and this app renders the
answer, including the refusal — a 409 with a button that changes the world, a
422 against the field that caused it (ADR 8).

**Scanning is the first tab and the app opens on it.** The product is a
printed QR on a box and a phone pointed at it; a tab buried behind a menu
would be burying the reason the app exists. A code read in the app and a label
opened from the stock camera go through the same screen, which resolves it
against the forest the app already loaded (ADR 12).

**The token lives in the Android Keystore**, by way of `expo-secure-store`,
because it grants full access to an inventory that is on the public internet.
`AsyncStorage` is a plain file in the sandbox — right for a remembered tab,
wrong for a credential.

Three things are shaped for a phone rather than copied from the browser:

- **A photo is a `file://` URI, not a `File`.** `expo-image-picker` hands back
  `{ uri, name, type }` and React Native's `FormData` streams it off disk;
  turning it into a `File` would mean holding a whole photo in the heap of the
  device that just took it. It is the one thing the shared client leaves open.
- **An image carries its own `Authorization` header.** The web client cannot
  put one on an `<img>` and fetches bytes into an object URL; React Native's
  `Image` takes headers, so the bytes go from the socket to the native decoder
  and a gallery of twenty is not twenty photos resident at once.
- **A unit picker is a list of rows, not a select.** Every option is a full
  path, and Android's picker wheel truncates it — which is exactly what makes
  a picker a coin toss between three boxes all called `Box 3`.

Tests drive the real screens through their accessible roles and labels, and
stub the network at the `fetch` boundary. Nothing in `src` is mocked. Three
things are ports because all three are the operating system and none of them
exists under a test runner: the keystore, the camera, and the photo library.

```sh
pnpm --filter @waymark/mobile start           # Metro, then press `a`
pnpm --filter @waymark/mobile test
pnpm --filter @waymark/mobile typecheck
pnpm --filter @waymark/mobile prebuild        # generates android/ from the config
```

`EXPO_PUBLIC_WAYMARK_API_URL` says where the API is, as a PHONE sees it. It
defaults to `http://127.0.0.1:3000`, which is only ever right on an emulator:
a real device on the same wifi needs the machine's LAN address, and a device
anywhere else needs the tunnel's public hostname. Put it in
`apps/mobile/.env`.

Android 9 and up refuse plain HTTP by default, so a LAN address needs
`usesCleartextTraffic` for development or the tunnel's HTTPS hostname for
anything else.

**The installable APK is built by EAS**, and `apps/mobile/README.md` is the
whole of it: one command after `eas-cli login`, plus one `eas env:set` the
first time. `eas.json` names no server. This repository is public, and a
hostname committed into it would be a hostname every fork inherited — so the
address lives on whichever Expo account runs the build, and a build that was
never given one fails by name instead of returning an APK that reaches
nothing.

The `https` intent filter is **derived from that same variable**, in
`app.config.ts`, and that is why this app has a `.ts` config beside its
`app.json` at all. A label encodes `<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>`
(ADR 12) and one container serves the API and the web client on one origin
(ADR 16), so the host printed on a sticker IS the host of the API address the
build was given. It used to be the placeholder `waymark.example`, which meant
the stock camera opened a browser for everybody.

A build told an `https:` address claims `/u` on that host, and the stock
camera offers this app. A build told anything else — including the
`http://127.0.0.1:3000` default — claims **no host at all**, which leaves
labels opening the web PWA exactly as they do today. Claiming nothing is the
right answer there: Android verifies no other scheme, and an APK that claimed
somebody else's hostname would be worse than one that claims none. The
`waymark://u/<code>` scheme needs no host and works either way.

## MCP server

`apps/mcp`. A Model Context Protocol server, over stdio, run on the machine
the assistant runs on. It exists so that somebody working on a project can ask
"which box is the soldering iron in" and get an answer without getting up: the
inventory is the memory, and this is how a model reads it.

It is **the third consumer of `packages/api-client`**, and it contains no HTTP
at all. That is the point rather than a detail — the shared client was built
for a browser and a phone, and a third consumer that had to write its own
requests would have proved the abstraction was two special cases wearing a
coat. One thing was genuinely missing and was added there rather than worked
around here: the client now takes the `Authorization` scheme as an option, so
it can carry a machine token as well as a session (ADR 17).

```
src/main.ts         The process. stdio IS the transport, so nothing prints.
src/configuration.ts  The address and the credential, out of the environment.
src/server.ts       The tools, and what their descriptions tell a model.
src/waymark.ts      The shared client, asked for the Machine scheme.
src/confirming.ts   Why a write is two calls and the second cannot be guessed.
src/credential.ts   What this token may do, asked before a write is offered.
src/failures.ts     One refusal, one sentence, no stack traces.
src/render.ts       Why an answer is lines rather than JSON.
src/tools/          One file per tool.
```

### The tools

| Tool | Answers |
| --- | --- |
| `waymark_search` | Where something is. Every hit with its full path. |
| `waymark_unit` | What one storage unit holds: units inside it, items in it. |
| `waymark_tree` | Every storage unit, nested, as an indented outline. |
| `waymark_items` | Every item in the house, each with where it is. |
| `waymark_add_item` | Records an item in a unit. **Confirmed**, see below. |
| `waymark_move_items` | Moves items into another unit. **Confirmed**. |

**Answers are lines, not JSON.** The reader is a model with a context budget,
and a forty-box inventory rendered as nested objects is mostly punctuation:
every row repeats every key in quotes, and the fields that carry no
information — `"quantity": 1`, `"tags": []`, `"description": null`, two
timestamps — repeat with them. So one line per thing, the location first
because the location is the answer, the id last and labelled because a model
needs it and a person never does, and anything that is only ever the default
left off. Two tests measure the rendered answer against the JSON it replaces
rather than asserting it is smaller.

**A refusal is a sentence that says what to do.** No token, a token the API
refused, an API that did not answer and a write a read-only credential may not
make are four situations with four different next moves, and a stack trace is
none of them. Each one names what happened, says whether anything changed, and
gives the command or the variable that fixes it. The token is never
interpolated into any of them — they are written from the variable's NAME — and
every answer is scrubbed of it on the way out anyway, because a rule holds
until somebody adds a path that breaks it and a credential in a transcript
cannot be taken back.

### A write is two calls, and the second one cannot be guessed

The two tools that change the inventory are confirmed rather than automatic.
The obvious way to build that is a `confirm: true` argument, and it is
worthless: the reader is a model, `true` is the value it reaches for, and a
mechanism that can be satisfied by pattern-matching has already been defeated.

So the confirmation is a **capability, not an assertion**. Called without one,
a write tool changes nothing: it resolves what it WOULD do — a real request, so
a box that does not exist is found out here — describes it in names and full
paths rather than ids, and answers with a code. The code is fifty random bits
from a CSPRNG, bound to a fingerprint of that exact change, spent once, and
lapsed after five minutes. `yes`, `true`, `confirm`, `I confirm` and a code
issued for a different change are each asserted to fail and to write nothing.

What that buys is structural: **a write is impossible unless its
plain-language description was put in the conversation first**, where the
person can read it. What it cannot do — and nothing inside an MCP server
can — is prove that a human did read it. That is what the scope is for.

**A `read` token makes writes impossible at the API regardless**, in the hook
that authenticated it, before the body is parsed (ADR 17). That is the
guarantee; the confirmation is the courtesy on top of it. Handed one, the write
tools say so in words — "the machine token \"mcp-server\" is read-only, so it
may read the inventory but may not change it" — and they say it BEFORE
previewing anything, by asking `GET /auth/me` what the credential may do. A
preview that invites somebody to agree to something the server already knows it
cannot do would be worse than the 403 it was trying to avoid.

### Running it

Create a token on the Waymark server, read-only unless the assistant is meant
to file things away:

```sh
pnpm --filter @waymark/api machine-token create --name mcp-server --scope read
```

Then, in the MCP client's settings:

```json
{
  "mcpServers": {
    "waymark": {
      "command": "/absolute/path/to/waymark/apps/mcp/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/waymark/apps/mcp/src/main.ts"],
      "env": {
        "WAYMARK_API_URL": "https://waymark.example",
        "WAYMARK_MACHINE_TOKEN": "wmk_..."
      }
    }
  }
}
```

Absolute paths to the checkout's own `tsx` rather than `pnpm start`, because an
MCP client started from a desktop session often has no package manager on its
`PATH` — and because **stdout is the transport**, so anything that prints to it
breaks the session rather than logging. Nothing in this package writes to
stdout; diagnostics go to stderr, which the client shows in its log.

| Variable | Default | What it decides |
| --- | --- | --- |
| `WAYMARK_MACHINE_TOKEN` | _unset_ | The credential. There is no default, and there will not be one. |
| `WAYMARK_API_URL` | `http://127.0.0.1:3000` | Where Waymark is, as this machine sees it. |

**Missing configuration does not stop it starting.** A server that exits is
drawn by its client as "failed", with the reason in a log file nobody has open;
one that starts and answers "Waymark has no machine token, create one with
..." puts the fix in front of the person who is at that moment asking where
something is. The tools stay listed for the same reason: an assistant told
there are no tools says Waymark is unavailable and stops.

```sh
pnpm --filter @waymark/mcp test
pnpm --filter @waymark/mcp typecheck
pnpm --filter @waymark/mcp start        # only useful with a client on the other end
```

Tests stub the API at the HTTP boundary with MSW and never mock
`@waymark/api-client` — a test that replaced the client would prove the
replacement was called and say nothing about the contract — and the tools are
driven through the real protocol over the SDK's in-memory transport, so a tool
that is not registered, a schema that rejects what a model would send, or a
refusal that arrives as a failed call rather than as a readable answer all fail
here.

## Deployment

One container serves the whole product: the API and the web client, on one
origin (ADR 16). It listens on loopback and is published through a Cloudflare
Tunnel, so there are no inbound ports, TLS terminates at Cloudflare, and the
tunnel needs exactly one hostname pointed at port 3000. Open that hostname in
a browser and the app is there. It is still on the public internet, which is
why the hardening above is not optional. See `apps/api/.env.example` for every
setting.

Two settings are the ones a fresh deployment has to get right.
`WAYMARK_PUBLIC_BASE_URL` is the tunnel's hostname, and it is what every
printed label encodes — set it before printing one, because a sticker is glued
to a box and only reveals a wrong base months later, in a garage.
`WAYMARK_ALLOWED_ORIGINS` is **empty**, and correct: the browser client is on
this origin now, so nothing it does is a cross-origin request and there is no
origin to allow.

```sh
# The whole product: one container, two volumes, no background removal.
docker compose up -d --build

# The same, plus the rembg sidecar.
docker compose -f docker-compose.yml -f docker-compose.image-processing.yml up -d --build

docker compose exec api node_modules/.bin/tsx src/scripts/create-user.ts --username dario
```

The sidecar is a second compose FILE rather than a profile and an environment
variable, because the container being there and the API knowing its address have
to be the same fact. Split across two switches, the interesting state is the
broken one: an address configured with no container behind it, where every photo
retries five times and ends up `FAILED`.

**Photos and the database are named volumes, mounted outside the image.** That
is the line that matters most in the compose file: an upgrade replaces the
image, and anything durable inside it goes with the old one. The rembg model is
a third volume for a smaller reason — 176 MB downloaded once instead of on every
container start.

The image is multi-stage: one stage runs the Vite build for `apps/web`, one
installs the API with pnpm, the workspace and the Prisma generator, and the
runtime stage has none of them — it gets the API's production `node_modules`
and the web client's `dist`, and no pnpm, no Vite and no esbuild. Migrations
are applied by the entrypoint with `prisma migrate deploy`, which applies
exactly what is checked in and never generates or resets anything. There is no
`depends_on` from the API to the sidecar: waiting for a model to download
before the inventory is reachable is precisely the dependency ADR 4 refuses.

The web client is built INSIDE the image rather than committed or deployed
separately, because the two halves are one deployable now. A stack able to
bring up an API from one commit and a client from another would have exactly
one interesting state, the mismatched one, and it would be discovered by
somebody standing in a garage.

### Deploying is a script, and it refuses

```sh
cp scripts/deploy.env.example scripts/deploy.env   # once; git ignores it
pnpm deploy          # scripts/deploy.sh
pnpm deploy:check    # every gate, and stop before touching the box
```

Where to deploy is one operator's fact, so it is not in the repository: the
host, the path on it and the public address live in `scripts/deploy.env`, and
the script refuses, naming the variable, when one is missing. A fork fills in
its own and inherits nobody's server.

A deploy used to be four commands pasted into a terminal, and on 2026-09-24
that shipped a broken image: `packages/tokens` was added, the Dockerfile's
hand-kept COPY list was not told, and the image failed at `vite build`. CI was
red on that exact commit eleven minutes earlier. Nobody looked — and
`docker compose up -d --build` **left the previous container running and
answering 200**, so the deployment looked healthy while serving the old bundle.
It was found by comparing a hashed JavaScript filename by eye.

So the checks are in a file now (ADR 23). `scripts/deploy.sh` refuses, before
touching the server, when:

- the working tree is not clean — rsync ships the working tree, so anything
  uncommitted would make the commit the image reports a lie;
- `HEAD` is not on both remotes, `github` and `origin`;
- **CI did not pass for that exact SHA.** Read from the public API with no
  token, because `gh` is not logged in on this machine and a gate that needs a
  login stops working silently. No run yet, still running, and failed are three
  different answers: only the middle one is worth waiting for, and the script
  waits for that one.

Then it deploys — rsync, `docker compose build`, `docker compose up -d` — and
then it **proves** it. Not by comparing bundle filenames, which is empty when
only the API changed and never names a commit: the image is built with a
`WAYMARK_COMMIT` build argument and the running container reports it on
`GET /health`. The script asserts the running commit equals the one it just
shipped, on the box over SSH and again through the tunnel, and exits non-zero
if it cannot. An image built without the argument answers `null`, which fails
the assertion — a local `docker build` still works, and only the deploy is
strict about it.

`docker compose build` and `docker compose up -d` are two commands rather than
`up -d --build`, so a failed build has an exit code of its own and nothing
follows it. The old container survives a failed build, which is correct: a
broken image is not a reason to take the inventory down. What changes is that
nobody is told a deploy happened.

There is one escape hatch, and it names a dependency rather than a check:

```sh
WAYMARK_DEPLOY_WITHOUT_GITHUB=1 pnpm deploy
```

That drops the two gates that need github.com to answer, prints a red banner
saying nothing has proved this commit, and keeps everything else — including
the verification, which can never be skipped. The argument is in ADR 23: a gate
with no way past it does not get obeyed at two in the morning, it gets walked
around by pasting the rsync out of the script, and that loses the proof as well
as the checks.

### On the target host, one thing has to be set first

The commands above are correct for an ordinary Docker host, and they are
correct on the box this is actually going to — a ZimaOS NAS — once one
environment variable is exported.

An earlier version of this section claimed ZimaOS has no `docker compose`. That
was **wrong**, and it is worth correcting rather than deleting, because the
symptom is a trap: the plugin is present at `/usr/lib/docker/cli-plugins`, and
`docker compose` still answers "is not a docker command". The real cause is
`/DATA/.docker`, which is root-owned and `drwx--x---`, so the CLI running as
the login user cannot read its config directory and **silently gives up on
plugin discovery** rather than saying it was denied. Point `DOCKER_CONFIG` at a
directory that user can write and both plugins appear:

```sh
export DOCKER_CONFIG="$HOME/.docker"   # HOME is /DATA on this box
mkdir -p "$DOCKER_CONFIG"
docker compose version                  # 2.32.4
docker buildx version                   # 0.16.1
```

| Constraint | What it means here |
|---|---|
| `docker compose` and `buildx` work, but only with `DOCKER_CONFIG` pointed somewhere readable. Without it the CLI finds no plugins and says so as if they were not installed. | Export it in the shell, or in whatever unit runs the stack. Then the commands above are the commands. |
| ~7.7 GiB RAM, of which another app already holds ~2.3 GiB, with swap in use at idle, on a 4-core i5-6400. | Budget against **4–5 GiB, not 8**. |

That last row decides the shape of the first deployment: **bring the stack up
without the sidecar.** An `onnxruntime` pass saturates every core it can reach,
and on this box that competes with the API serving the request that triggered
it.

This is not a workaround. ADR 4 made background removal an optional adapter for
reasons that had nothing to do with this machine's memory, and a deployment
without it is a supported configuration, not a degraded one: photos stay
`PENDING`, originals are served, and the app's `/processing` screen shows the
queue waiting. Add the second compose file later, once there is a real
inventory to
judge the cost against.

## Continuous integration

`.github/workflows/ci.yml` installs with a frozen lockfile and then runs
`pnpm typecheck` and `pnpm test` across the whole workspace, on every push and
every pull request. Node 22, because that is what `docker/api.Dockerfile`
runs; pnpm read from `packageManager` rather than written down a second time.

Three details are the difference between that job and a green badge that means
nothing. The install runs its scripts: six packages are listed under
`allowBuilds` and `apps/api` has a `postinstall` that runs `prisma generate`,
and an install that holds any of them back still exits 0 and looks healthy
while breaking everything after it. The generator runs before `tsc`, because
the types `apps/api` imports do not exist on disk until it has. And `pnpm -r
test` is two runners — vitest everywhere, jest in `apps/mobile` — where a
failure in either has to exit non-zero, which is the one property the whole
file exists for.

A second job builds `docker/api.Dockerfile` and then **runs it**, with no
environment at all, and asserts the container answers `GET /health` with the
commit it was built from. Building is not running: until this step existed, an
image that built and then died on boot passed — the entrypoint's `prisma
migrate deploy`, the query engine matching the runtime's OpenSSL, the server
binding a port, none of it was covered. It also makes the deploy gate's one
assumption true by test rather than by hope.

Only the pnpm store is cached, keyed on the hash of `pnpm-lock.yaml`. The
store is content addressed and the install is `--frozen-lockfile`, so the
lockfile decides what is installed and the cache only decides how long that
takes.

## Releasing

A version is decided from the commits and published when a person says so.

On every push to `main`, release-please reads the conventional commits since
the last release and keeps one pull request open that bumps the root
`package.json`, `.release-please-manifest.json` and `expo.version` in
`apps/mobile/app.json`, and writes `CHANGELOG.md`. `fix:` is a patch and `feat:`
a minor; while this is 0.x, a breaking change is a minor too. **Merging that
pull request is the release.** It then runs the whole of CI against the tagged
commit, builds the APK on EAS, checks the build is exactly that commit and
version, and attaches it to the GitHub release.

The one secret it needs is `EXPO_TOKEN`. The signing keystore never leaves EAS
— an Android app's identity is its package name plus that key, and a key on one
laptop is one disk failure from never shipping an update again.

A tag pushed by hand (`git tag v0.2.0 && git push github v0.2.0`) goes through
the same `release.yml`, for the day release-please is the thing that is broken.

## Status

Domain, persistence, HTTP, authentication, search, editing, QR generation,
photo storage, background removal, the Docker stack, the web PWA, the Android
app and the MCP server are implemented, and so are multi-label print sheets —
in the web client, which is where a printer is. The PWA is served by the API from the
same origin (ADR 16), so one container behind one tunnel hostname is the whole
product rather than an API somebody has to drive with `curl`.

Both clients print the label sheet. The browser renders it with print CSS in
millimetres; the phone builds the same page as HTML and hands it to Android's
print service through `expo-print`, whose own dialog is the preview. The page
geometry — margins, the 3×4 grid, the 36 mm symbol — lives once, in
`packages/tokens`, so the two renderers cannot disagree about the paper
(ADR 21, amended; ADR 22).

The Android app runs on a real phone. It is built on EAS, installed on the
owner's handset, and published as a GitHub release (`v0.1.0`). Releases are
cut by release-please — see [Releasing](#releasing). What is still unproven on
a device, stated so nobody reads the tests as more than they are: a sheet
printed on paper and scanned back, the camera upload path after its fix, and
how the Spanish labels wrap at 360 px. `docs/roadmap.md` keeps that list.

The MCP server is verified the same way, and with the same honesty about where
that stops. Its tools are driven through the real protocol against a stubbed
API, and the process itself has been started over real stdio and answered
`initialize` and `tools/list` with all six tools. It has never been driven by
an assistant against a running Waymark, and nothing in this repository can do
that: it needs a real API, a real machine token and a real MCP client.

Every repository port is covered by a shared contract suite that runs twice:
once against the in-memory repositories the domain is tested with, once against
the Prisma adapters on a real SQLite file. `MachineTokenRepository` is covered
the same way, by a suite that lives beside the port in `apps/api` rather than in
`packages/domain-contract-tests` — that package depends on `@waymark/domain` and
nothing else, and `apps/api` already depends on IT, so moving an auth port's
contract in there would close a cycle. The fake and the real adapter are
therefore proven interchangeable, which is the only thing that makes the ports
worth the indirection.

Search runs that same suite, and most of it is about the inventory CHANGING:
an index that silently stops tracking a rename is a feature that looks like it
works and quietly cannot find a box. So the contract renames, retags, clears a
description, moves and deletes, against both implementations. On top of that,
one file writes straight into the tables with raw SQL — past every adapter and
every use case — and then searches, which is a bar no application-maintained
index could clear.

Background removal is tested the same way — against a real HTTP server on a
loopback port rather than a mocked client, because every interesting property of
talking to a container over a network lives exactly where a mock would replace
it. The suite covers a refused connection, a socket that accepts and never
answers, an error page served as `image/png`, a refusal, two workers racing for
the same photo, a backlog larger than the concurrency bound, a process that died
mid-flight, and the sidecar switched off entirely.

```sh
pnpm install
pnpm test        # domain + contract suites + persistence + HTTP + both clients
pnpm typecheck

pnpm --filter @waymark/api prisma:migrate
pnpm --filter @waymark/api create-user
pnpm --filter @waymark/api machine-token create --name mcp-server --scope read
pnpm --filter @waymark/api dev
```
