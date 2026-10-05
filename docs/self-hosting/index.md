# Deployment

One container serves the whole product: the API and the web client, on one
origin (ADR 16). It listens on loopback and is published through a Cloudflare
Tunnel, so there are no inbound ports, TLS terminates at Cloudflare, and the
tunnel needs exactly one hostname pointed at port 3000. Open that hostname in
a browser and the app is there. It is still on the public internet, which is
why the hardening in [Authentication](../product/accounts.md) is not optional. See `apps/api/.env.example` for every
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

**The sidecar is published on the host's loopback, `127.0.0.1:8001`, and the
API is told exactly that address.** Not the compose service name: the API runs
in the host's network namespace (so the rate limiter sees real callers), where
`image-processor` does not resolve and the project network is not reachable.
That mismatch shipped once, silently — the overlay predated the move and kept
the service name, so turning the feature on would have left every photo
`FAILED`. `apps/api/src/http/turning-background-removal-on-reaches-the-sidecar.test.ts`
now reads both files and checks that the address and the published port agree,
and that the port is bound to loopback and nowhere wider. The `docker-proxy`
source rewriting that rules published ports out for the API does not matter
here: the sidecar's only caller is the API, and it asks nothing of the address.

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

## Deploying is a script, and it refuses

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

Background removal is an opt-in in the same file, because it describes the box
rather than one deploy:

```sh
# scripts/deploy.env
WAYMARK_DEPLOY_IMAGE_PROCESSING=1
```

It exports `COMPOSE_FILE=docker-compose.yml:docker-compose.image-processing.yml`
for every compose command the script runs on the box, and for the `ps` and
`logs` commands it prints when something fails. Unset or `0` is the deploy
without it; any other value is refused before anything is touched. The proof is
still the API's commit alone — the API is healthy with or without a sidecar
(ADR 4), so a model still downloading is not a failed deploy. A `.env` on the
box would not do: rsync `--delete` removes files the repository does not have.

## On the target host, one thing has to be set first

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
queue waiting. Add the second compose file later —
`WAYMARK_DEPLOY_IMAGE_PROCESSING=1` in `scripts/deploy.env` — once there is a real
inventory to
judge the cost against.
