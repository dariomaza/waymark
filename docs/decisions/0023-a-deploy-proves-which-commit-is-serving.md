# 23. A deploy proves which commit is serving

- Status: accepted
- Date: 2026-09-24

## Context

On 2026-09-24 a broken image was deployed, and everything built to stop it
worked.

`packages/tokens` had been added. `docker/api.Dockerfile` enumerates the
workspace packages it copies by hand — the price of a layer cache that a
dependency change alone does not bust — and nobody told it. The image failed at
`pnpm --filter @waymark/web build`. CI went red on that exact commit, eleven
minutes before the deploy, in a job whose comment describes this precise class
of failure because it had already happened once with `packages/i18n`.

The deploy happened anyway, because the person deploying did not look. And then
the part that made it invisible: `docker compose up -d --build` **left the
previous container running**, healthy, answering 200. The stack was up, the
hostname worked, the app drew, the healthcheck was green. The only reason it was
found at all is that somebody compared the hashed filename of the served
JavaScript bundle against the one in `apps/web/dist`, by eye.

So there were two problems, and only one of them is about a Dockerfile.

### What could not be proven

Nothing a deploy produced answered the question **"which commit is serving?"**

- `docker compose ps` says a container is up. It does not say which image, and a
  container from before the deploy is up in exactly the same words.
- The healthcheck says the process answers. It answered throughout.
- Comparing bundle filenames is a proxy in two directions. It is **empty when
  only the API changed** — the bundle is byte-identical and its name is a hash
  of contents that did not change — and even when it does differ, it says
  "these are not the bytes I had before", never "this is the commit I
  deployed".

Every available signal was consistent with a successful deploy. That is the
defect: not that a Dockerfile went stale, but that a deployment could be wrong
and look right.

### Why "remember to check CI" is not the fix

It is the thing that just failed. A procedure that lives in somebody's head is
not a check; it is a hope with a number on it. The repository already learned
this once when it added `.github/workflows/ci.yml`: "a suite nobody runs is not
a safety net, it is a document that claims to be executable."

A deploy nobody verifies is the same document, one layer down.

## Decision

**A deploy is a script, the script refuses before it touches the server, and it
exits non-zero unless the running container reports the commit it just
shipped.**

Three parts.

### The image is told which commit it is, and says so on `/health`

`docker/api.Dockerfile` takes a `WAYMARK_COMMIT` build argument in the runtime
stage and exports it. `loadConfig` reads it. `GET /health` answers
`{ "status": "ok", "commit": "<sha>" }`.

**It lives on `/health` rather than on a `/version` beside it**, and that is the
part worth defending. A deploy asks two questions in one breath — is it up, and
is it the new one — and anything verifying a release polls `/health` until it
answers. Putting the identity into that same answer makes it impossible to learn
that the container came up without also learning what came up. A sibling route
is a route that can be skipped, forgotten, or deleted by somebody who saw no
caller for it, and a deploy that skipped it would be back to comparing
filenames. One route, one request, one fact.

`/health` is also already the right shape for it: it is the one unauthenticated
route, and the deploy script runs on a laptop holding no credentials for this
deployment. A gate that needs a secret is a gate somebody eventually works
around.

**The cost is disclosure.** `/health` is reachable through the tunnel, so
`https://waymark.idemcloud.uk/health` now tells anybody which commit of a public
repository is running, and therefore which known defects apply to it. That is
real and it is small: the repository is public, every commit in it is already
readable, and the served bundle's hashed filename already changed with every
build. It was accepted rather than hidden, because the alternatives are worse —
authenticating the probe would put a credential in the deploy path, and a
guessable secret path is not a security boundary.

### An unset build argument is `null`, not a refusal

`ARG WAYMARK_COMMIT=""`. A `docker build` that says nothing still builds, and
the container answers `"commit": null`.

The opposite — refusing to start without it — was considered and rejected. The
commit is the only value in `config.ts` that **decides nothing**: nothing reads
it, branches on it, or hands it anywhere. Every other value there is validated
hard precisely because it decides something, and a setting that parses and is
wrong is a security hole wearing the face of a working deployment. Refusing to
boot over a label would make this field able to take the inventory down, and
would break every contributor's `docker build` for the sake of one NAS.

So the process is honest and the gate is strict. `null` is not equal to the
commit being deployed, so `scripts/deploy.sh` refuses, and the refusal happens
where a person is watching rather than in a container restart loop.

The key is always present, never omitted, because **absent and null are
different sentences**. No `commit` key at all means an image from before this
decision — the container was not replaced. `null` means the image was built
without being told. They are fixed by different actions, so the script says
which one it found.

### The build is its own command, with its own exit code

`scripts/deploy.sh` runs `docker compose build` and then `docker compose up -d`,
and never `docker compose up -d --build`.

The combined form is one command with one exit code for two outcomes, and the
outcome it hides is the incident: a failed build leaves the previous container
running. It does exit non-zero — but it does so at the end of several minutes of
build log, after which `docker compose ps` shows a healthy container, and the
person reading it concludes the deploy worked. Split, the build has an exit code
of its own and nothing follows it.

**The old container still survives a failed build, and that is deliberate.** A
broken image is not a reason to take the inventory offline; it is a reason for
nobody to believe the new code is live. The first is a choice about
availability, the second is a choice about honesty, and only the second was
broken. The verification below is what keeps them separate.

### What the script refuses, in order

Cheapest and most local first, so the expensive checks are never reached by a
deploy that was already going to be refused.

1. **A dirty working tree.** rsync ships the working tree; the image reports the
   commit. If they differ, the proof is not weakened, it is a lie.
2. **A commit that is on neither remote** (`github` and `origin`, the bare
   repository on the NAS). Reachability, not tip equality.
3. **CI, for that exact SHA**, read from the public API with no token —
   `gh` is not authenticated on this machine and a gate that depends on a login
   stops working silently. The endpoint takes the full 40 characters; a short
   SHA answers `total_count: 0`, which is indistinguishable from "no run yet".
   Four answers, and three are refusals:

   | Answer | What it means | What the script does |
   |---|---|---|
   | no run | GitHub has never seen this commit | refuse; waiting will not fix a push that never happened |
   | in progress | the only state waiting resolves | wait, bounded, then refuse |
   | failed | the incident | refuse, and name the run |
   | cancelled or skipped only | nothing was proved | refuse; not green is not green |

Then it deploys. Then it verifies twice — on the box over SSH, which proves the
container was replaced, and through the tunnel, which proves the world can reach
it. Two assertions because they fail for different reasons, and a deploy that
cannot tell them apart sends somebody to the wrong layer.

### CI runs the image it builds

The `image` job built the image and never started it. A container that builds
and then dies on boot passed. Everything between `docker build` succeeding and
the app being reachable was unverified: the entrypoint's `prisma migrate
deploy`, the Prisma query engine matching the runtime's OpenSSL, `createWebClient`
finding a build, the server binding a port.

It now runs the image with **no environment at all** — the stronger claim, that
the image's own defaults are a complete configuration — and asserts it reports
the commit it was built with. That makes the deploy gate's one assumption true
by test rather than by hope: if the plumbing that carries a commit into the
process ever breaks, the deploy would refuse every time and nobody would know
which half was wrong.

## The escape hatch

`WAYMARK_DEPLOY_WITHOUT_GITHUB=1` skips the two gates that need github.com to
answer: that HEAD is on the `github` remote, and that CI passed. Nothing else.

**It names the dependency, not the check.** The plausible two-in-the-morning
emergency is not "I disagree with CI", it is "github.com is not answering" — and
in that state the `git fetch github` fails too, so a hatch that skipped only the
CI query would not have helped. Skipping the whole GitHub-shaped dependency is
the honest unit.

The argument for having one at all is that a gate with no way past it is not a
gate somebody obeys. It is a gate somebody walks around, by pasting the rsync
and the ssh out of the script — and that loses every check AND the verification,
which is the half that actually proves something. A hatch that drops one
dependency and keeps the proof is strictly better than the bypass it competes
with. It prints a red banner saying nothing has proved this commit builds an
image that runs.

Two things it cannot skip, ever:

- **The dirty-tree refusal.** Without it the image reports a SHA whose tree is
  not what is running, and the whole mechanism becomes a more convincing lie
  than the one it replaced.
- **The verification.** Skipping it returns the deploy to exactly the state that
  caused the incident: green-looking and unproven.

## Consequences

- A deploy either proves which commit is serving or exits non-zero. There is no
  longer a way for it to look successful and be wrong.
- `GET /health` grew a field. Two tests that asserted the whole body were
  updated; the image's `HEALTHCHECK` reads `r.ok` and is unaffected.
- The deploy is now blocked by GitHub being reachable. That is a real cost with
  a real hatch, and the hatch is loud.
- It is also blocked by a red CI run, which is the point, and there is no hatch
  for that beyond the GitHub-shaped one — which is deliberately the same
  switch, so "I want to skip CI" and "GitHub is down" cannot be pretended to be
  different requests.
- A container older than this decision now fails verification with a message
  saying so, rather than passing quietly. The first deploy after this one is the
  last time that can happen.
- `scripts/deploy.sh` is not unit-tested and cannot honestly be. Its API half is
  (`config.test.ts`, `the-api-says-which-commit-it-is.test.ts`,
  `the-image-is-told-which-commit-it-is.test.ts`, and CI running the built
  image); the shell is covered by having been run, refusals included.
- CI got slower by the time it takes to boot a container, and gained the only
  step that can tell "the image builds" from "the image works".
