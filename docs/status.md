# Status

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
cut by release-please — see [Releasing](./development/releasing.md). What is still unproven on
a device, stated so nobody reads the tests as more than they are: a sheet
printed on paper and scanned back, the camera upload path after its fix, and
how the Spanish labels wrap at 360 px. [The roadmap](./roadmap.md) keeps that list.

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
