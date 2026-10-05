# Continuous integration

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
