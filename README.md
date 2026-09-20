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
docker/                Compose stack for the homelab.
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

**Expo instead of native Kotlin.** Expo lets the Android app share
`packages/domain` and the API client with the web app, in one language, with no
Android Studio in the build path. Native Kotlin would mean two independent
implementations of the same domain.

**QR codes are generated and persisted server-side** when a storage unit is
created, and served as PNG/SVG so they stay stable and printable.

## Stack

- pnpm workspaces
- TypeScript everywhere
- Fastify, Prisma, SQLite
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
| `GET`    | `/storage-units`            | `{ tree }` — the whole forest, nested        |
| `POST`   | `/storage-units`            | `201 { unit }`                               |
| `GET`    | `/storage-units/:id`        | `{ unit, path, children, items }`            |
| `POST`   | `/storage-units/:id/move`   | `{ unit }` — body `{ parentId }`             |
| `POST`   | `/storage-units/:id/empty`  | `{ movedItems, movedChildUnits }`            |
| `DELETE` | `/storage-units/:id`        | `204`                                        |
| `POST`   | `/items`                    | `201 { item }`                               |
| `GET`    | `/items/:id`                | `{ item, storageUnit, path }`                |
| `POST`   | `/items/move`               | `{ items }` — body `{ itemIds, targetUnitId }` |
| `DELETE` | `/items/:id`                | `{ releasedPhotoIds }`                       |

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

409 means "fix the world, then retry": the same bytes succeed once somebody
empties the box or moves the target out of the subtree. 422 means "fix the
request": nothing anybody else does will make these exact bytes work. A test
walks every `DomainError` the domain exports and fails if one has no entry in
the table, so an unmapped error can never become an accidental 500.

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

## Status

Domain, persistence, HTTP and authentication implemented. No QR generation or
photo file handling yet.

Every repository port is covered by a shared contract suite that runs twice:
once against the in-memory repositories the domain is tested with, once against
the Prisma adapters on a real SQLite file. The fake and the real adapter are
therefore proven interchangeable, which is the only thing that makes the ports
worth the indirection.

```sh
pnpm install
pnpm test        # domain + contract suites + persistence + HTTP
pnpm typecheck

pnpm --filter @ariadna/api prisma:migrate
pnpm --filter @ariadna/api create-user
pnpm --filter @ariadna/api dev
```
