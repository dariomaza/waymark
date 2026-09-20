# Ariadna

Self-hosted inventory for a home / homelab: register storage units (drawers,
boxes, shelves, crates), record the items inside them, and find anything again
by scanning a QR code or searching by name, unit, or location.

Named after the thread that leads you out of the labyrinth. The house is the
labyrinth; this is the thread.

## Problem

Things get stored and then lost. Not lost as in gone, lost as in "it is
somewhere in one of forty boxes". Ariadna makes every storage unit addressable
via a printed QR code and every item searchable.

## Scope

**Storage units** — name, location, description, photo, generated QR code.
**Items** — name, description, one or more photos, and a parent storage unit.
Items can be created, deleted, and moved between units.

## Architecture

One API, two clients. The domain knows nothing about HTTP, React, or SQL.

```
packages/domain        Entities, use cases, ports. Zero dependencies.
packages/domain-contract-tests  Shared contract suites every adapter of a port
                       must satisfy. Run against the in-memory repositories and
                       against the real ones.
apps/api               Fastify + Prisma. Adapters that implement the ports, the
                       HTTP layer, and authentication.
apps/web               React + Vite PWA. Camera and QR scanning in-browser.
apps/mobile            Expo (React Native). Android app.
services/image-processor  rembg sidecar. Optional background removal.
docker/                The API image and its entrypoint.
docs/decisions/        Architecture decision records.
```

### Key decisions

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

**Expo instead of native Kotlin.** Expo lets the Android app share
`packages/domain` and the API client with the web app, in one language, with no
Android Studio in the build path. Native Kotlin would mean two independent
implementations of the same domain.

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
- React + Vite (PWA), `@zxing/browser` for scanning
- Expo / React Native
- Python + rembg (sidecar only)
- Docker Compose

## HTTP API

Everything but `GET /health` and `POST /auth/login` needs a session.

| Method   | Route                       | Answers                                      |
| -------- | --------------------------- | -------------------------------------------- |
| `GET`    | `/health`                   | `{ status }`                                 |
| `POST`   | `/auth/login`               | `{ token, expiresAt, user }`                 |
| `GET`    | `/auth/me`                  | `{ user }`                                   |
| `POST`   | `/auth/logout`              | `204`                                        |
| `GET`    | `/search`                   | `{ query, terms, items, storageUnits }`      |
| `GET`    | `/storage-units`            | `{ tree }` — the whole forest, nested        |
| `POST`   | `/storage-units`            | `201 { unit }`                               |
| `GET`    | `/storage-units/:id`        | `{ unit, path, children, items }`            |
| `POST`   | `/storage-units/:id/move`   | `{ unit }` — body `{ parentId }`             |
| `POST`   | `/storage-units/:id/empty`  | `{ movedItems, movedChildUnits }`            |
| `DELETE` | `/storage-units/:id`        | `204`                                        |
| `POST`   | `/items`                    | `201 { item }`                               |
| `GET`    | `/items/:id`                | `{ item, storageUnit, path }`                |
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

Move and empty are named operations rather than a `PATCH`, because a storage
unit has no general update: the domain exposes create, move, empty and delete,
and a `PATCH` would advertise fields that are not patchable and hide the fact
that changing a parent is guarded by a subtree invariant (ADR 2).

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

409 means "fix the world, then retry": the same bytes succeed once somebody
empties the box or moves the target out of the subtree. 422 means "fix the
request": nothing anybody else does will make these exact bytes work. A test
walks every `DomainError` the domain exports and fails if one has no entry in
the table, so an unmapped error can never become an accidental 500.

## Search

The feature the product is named after. Things get stored and then lost — not
lost as in gone, lost as in "it is somewhere in one of forty boxes" — and this
is the thread out of that labyrinth.

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
`<ARIADNA_PUBLIC_BASE_URL>/u/<publicId>` — a URL, never a bare id, because
Android's stock camera offers to OPEN a URL and offers to copy a string, and
"install the app, open it, then scan" is the workflow the label exists to avoid.

Error correction is **level Q**, 25%. L is sized for a symbol on a screen and one
scuff turns the label into decoration. H is not simply better: more redundancy
means a larger symbol, so at a fixed sticker size every module gets smaller until
the camera stops resolving them. A test scrubs out a square of the symbol and
asserts Q still decodes where both L and M lose the URL.

## Photos

A storage unit holds at most one photo; an item holds up to ten, ordered, first
one is the cover. Files live on `ARIADNA_PHOTO_ROOT`, a plain directory mounted
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
- **Deleting releases the files.** The rows go first, then the files, and a
  failed unlink is logged rather than thrown. A read-only volume must not make
  deleting an item impossible; a file with no row costs disk, a lost delete is a
  lie to the user.

## Background removal

Optional, out of process, and unable to break anything (ADR 4, ADR 10). With
`ARIADNA_IMAGE_PROCESSOR_URL` unset there is no processor, no worker and no
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
in the queue and forget their attempts. `GET /health` is deliberately untouched
by all of this: it answers `ok` while background removal is broken, behind or
switched off, which is exactly what "optional" has to mean.

| Variable                                  | Default  | What it decides                                    |
| ----------------------------------------- | -------- | -------------------------------------------------- |
| `ARIADNA_IMAGE_PROCESSOR_URL`             | _unset_  | The sidecar's address. Unset switches the feature off. |
| `ARIADNA_IMAGE_PROCESSOR_TIMEOUT_SECONDS` | `120`    | When one removal is abandoned as hung.              |
| `ARIADNA_IMAGE_PROCESSOR_CONCURRENCY`     | `1`      | Photos in flight at once. rembg already uses every core. |
| `ARIADNA_IMAGE_PROCESSOR_MAX_ATTEMPTS`    | `5`      | Attempts before a photo is left `FAILED`.           |
| `ARIADNA_IMAGE_PROCESSOR_POLL_SECONDS`    | `15`     | How often work is looked for when no upload woke it. |

## Authentication

One shared inventory. Users are credentials, not tenants: there is no owner
column, no per-user scoping and no roles. Everybody who can log in sees and
edits the same house.

- **No sign-up, ever.** Accounts are created from a shell on the server with
  `pnpm --filter @ariadna/api create-user`. The password is never an argument;
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

## Deployment

The API listens on loopback and is published through a Cloudflare Tunnel, so
there are no inbound ports and TLS terminates at Cloudflare. It is still on the
public internet, which is why the hardening above is not optional. See
`apps/api/.env.example` for every setting.

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

The API image is multi-stage: the build stage has pnpm, the workspace and the
Prisma generator, and the runtime stage has none of them. Migrations are applied
by the entrypoint with `prisma migrate deploy`, which applies exactly what is
checked in and never generates or resets anything. There is no `depends_on` from
the API to the sidecar: waiting for a model to download before the inventory is
reachable is precisely the dependency ADR 4 refuses.

## Status

Domain, persistence, HTTP, authentication, search, QR generation, photo
storage, background removal and the Docker stack are implemented. The web PWA,
the Expo app and printable label sheets are not built yet.

Every repository port is covered by a shared contract suite that runs twice:
once against the in-memory repositories the domain is tested with, once against
the Prisma adapters on a real SQLite file. The fake and the real adapter are
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
pnpm test        # domain + contract suites + persistence + HTTP
pnpm typecheck

pnpm --filter @ariadna/api prisma:migrate
pnpm --filter @ariadna/api create-user
pnpm --filter @ariadna/api dev
```
