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
apps/api               Fastify + Prisma. Adapters that implement the ports.
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

## Status

Domain and persistence implemented. No HTTP layer, QR generation or photo file
handling yet.

Every repository port is covered by a shared contract suite that runs twice:
once against the in-memory repositories the domain is tested with, once against
the Prisma adapters on a real SQLite file. The fake and the real adapter are
therefore proven interchangeable, which is the only thing that makes the ports
worth the indirection.

```sh
pnpm install
pnpm test        # domain + contract suites + persistence
pnpm typecheck
```
