---
paths:
  - "apps/api/**"
  - "packages/domain/**"
  - "packages/domain-contract-tests/**"
---

# The API and the domain

- **Hexagonal.** `packages/domain` holds entities, ports and use cases with zero
  runtime dependencies. `apps/api` provides Prisma adapters and the Fastify
  routes. HTTP never reaches into Prisma directly.
- **Every port has one contract suite**, in `packages/domain-contract-tests`,
  run twice: against the in-memory fakes and against the Prisma adapters on a
  real SQLite file. A new port gets a contract before it gets an adapter.
  (Auth ports' contracts live beside them in `apps/api`, to avoid a package
  cycle.)
- **Test databases** are copies of one template migrated once per run by
  `prisma migrate deploy` (`src/persistence/testing/migrate-template.ts`).
  Never build a schema by another route — a hand-rolled one once passed on
  macOS and failed on Linux.
- **Status codes** follow ADR 8: 409 when the world must change first, 422 when
  the request was wrong. Every domain error is mapped; none falls through to 500.
- **`GET /health`** reports `{ status, commit }`; the commit comes from the
  `WAYMARK_COMMIT` build argument and is `null` when unset. Deploys depend on it.
- **Configuration** is read and validated in one place at boot and refused by
  name when wrong (`WAYMARK_PUBLIC_BASE_URL` must be https or loopback, for
  WebAuthn). `apps/api/.env.example` documents every variable.
- **Admin tasks are CLI scripts**: `create-user`, `machine-token`
  (`pnpm --filter @waymark/api <script>`). There is no sign-up, by design.
