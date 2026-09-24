# Waymark — working in this repository

Self-hosted inventory for the things in a house: spaces that hold spaces, things
inside them, a QR label on every box, search that answers "where did I put it".
Two clients (a PWA and an Android app) over one API, plus an MCP server so an
assistant can be asked where something is. **The README is the product and
architecture reference (1,300 lines); read the section you need, not all of it.**

Area-specific rules load on their own from `.claude/rules/` when you touch
`apps/mobile`, `apps/web`, `apps/api`, `packages/i18n` or the ops files.

## Layout

| Package | What it is |
|---|---|
| `packages/domain` | Entities, ports, use cases. **Zero runtime dependencies — keep it that way.** |
| `packages/domain-contract-tests` | One suite per port, run against the in-memory fakes AND the Prisma adapters. |
| `packages/api-client` | The only HTTP client. Web, mobile and MCP all use it; none of them call `fetch` themselves. |
| `packages/i18n` | Every word a person reads, English and Spanish. |
| `packages/tokens` | Colours, spacing, type, radii and label-sheet geometry, written once for both clients. |
| `apps/api` | Fastify + Prisma + SQLite. Also serves the web client from the same origin (ADR 16). |
| `apps/web` | React + Vite PWA. |
| `apps/mobile` | Expo / React Native, Android. Built on EAS. |
| `apps/mcp` | stdio MCP server over `api-client`, authenticated with a machine token. |
| `services/image-processor` | Optional rembg sidecar (ADR 4). |

Decisions are in `docs/decisions/` (23 ADRs, indexed in its README). What is
pending, unproven or deliberately postponed is in `docs/roadmap.md` — read it
before proposing something, it may already have been argued.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm typecheck | grep -c Done        # must print 9 — see the trap below
pnpm -r --filter '!@waymark/mobile' test
pnpm --filter @waymark/mobile test   # jest-expo; run it on its own
pnpm --filter @waymark/web build
cd apps/mobile && EXPO_PUBLIC_WAYMARK_API_URL=https://example.invalid npx expo export --platform android
```

Baselines at the time of writing — confirm them at your branch point before
trusting them, stale numbers have misled work here twice: tokens 45, domain 264,
contract 152, api-client 90, mcp 88, i18n 1434, api 1329, web 555, mobile 303.

## Rules that are not negotiable

- **Strict TDD.** Failing test first. Tests describe what a person can DO or SEE,
  never which component rendered.
- **Mutation-test every slice.** Break the code, watch a test fail, revert. Eight
  tests here were once green for the wrong reason. **If a mutation breaks
  nothing, first check the mutation actually landed in the file** — `sed` has
  silently failed to apply twice.
- **Every visible string goes through `packages/i18n`**, both `en.ts` and `es.ts`,
  with a doc comment. Spanish is **tú, never usted** (the header of `es.ts`
  says why). Compiler-API guards in both apps fail on literals.
- **Code, identifiers, comments, UI copy, docs and commits are English.**
- **Conventional commits. Never add a `Co-Authored-By` line or any AI
  attribution** — the owner's standing rule, and it overrides any tool default.
- **No hex literals in either client.** Colours come from `packages/tokens`;
  `apps/web/src/ui/styles/tokens.css` is generated from it and checked byte for
  byte — never edit it by hand.
- **Icons only through `ui/atoms/icon.tsx`** (lucide behind it, ADR 20). The
  `waypoints` mark is hand-drawn and must stay so.
- **48×48 minimum tap target.** It is used one-handed in a garage.
- **The two clients are one product.** A visible change in one is made in the
  other in the same piece of work, unless an ADR says why not. Where they differ,
  the phone's shape wins (ADR 22). One primary action per screen (ADR 21).

## Traps this repository has already fallen into

- **`pnpm typecheck` can exit 0 while broken.** Count the `Done` lines.
- **Health is `GET /health`, not `/api/health`.** The latter falls through to the
  web shell and answers 200 with HTML for anything. `/health` also reports the
  commit the running image was built from.
- **A failed image build leaves the OLD container running and answering 200.**
  A deploy is proven by `/health` naming the new commit, never by a status code.
- **`docker/api.Dockerfile` lists workspace packages by hand.** A new package
  must be added there; `apps/api/src/http/the-image-carries-every-package-it-builds.test.ts`
  fails if you forget. Put a new test's anchor INSIDE the stage it measures.
- **pnpm is strict.** Anything a config file names (`babel.config.js`,
  `metro.config.js`) must be a declared dependency, or EAS fails after ten
  minutes of successful native build.
- **A layer reporting another layer's failure.** Three incidents, one shape: a
  browser WebAuthn error shown as a server error, an unreadable photo shown as
  "offline", a broken build shown as 200. Name the layer that actually failed.
- **Assert on the thing being chosen.** A test comparing rendered strings that
  interpolate a value is always "different"; assert on the `Message.key`. A test
  querying the whole screen finds controls outside the panel under test.
- **jsdom: `DOMException instanceof Error` is false** (true in real browsers).
  Read `name`/`code` off `unknown`.
- **`command | tail` in a background task prints nothing until it exits.**
  Redirect to a file.

## Working here

- **Worktrees**, one per piece of work, at `../waymark-worktrees/<name>` — never
  under `/tmp`. **One agent per checkout**: two once shared one and their changes
  intermingled. Never bare `git stash`; the stash stack is shared.
- **CodeGraph** is used before broad searches. `.codegraph/` is gitignored and
  per-checkout — every worktree builds its own. **Check `codegraph status`
  reports roughly the number of files `git ls-files '*.ts' '*.tsx'` does** (~640):
  `codegraph sync` only follows files it already knows and answers "up to date"
  over an index missing most of the repo. It once held 36 of 632 files, and
  would have answered "no callers" about code used in twenty places. If the
  counts are far apart, that is corruption: `codegraph index`.
- **Deploy**: `pnpm deploy` (`scripts/deploy.sh`, ADR 23). Needs
  `scripts/deploy.env` (gitignored; copy the `.example`). It refuses unless the
  tree is clean, the commit is pushed and CI is green for that exact SHA, then
  proves the running commit. `pnpm deploy:check` stops before the server.
- **Release**: merge release-please's PR. See the README's *Releasing*. Needs the
  `EXPO_TOKEN` repository secret; the signing keystore stays on EAS.
- **Remotes**: `github` (public) and `origin` (the operator's mirror). Push both.

Machine-specific facts — the operator's server, accounts, device — are NOT in
this repository. They live in Claude Code's per-project memory on the
operator's machine.
