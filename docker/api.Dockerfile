# The API image.
#
# Two stages, and the split is not cosmetic: the build stage needs pnpm, the
# Prisma CLI's generator, the whole workspace including the contract tests, and
# a node_modules with every devDependency in it. None of that can reach the
# thing that runs on the homelab box, which parses images from the internet for
# a living.
#
# Build it from the REPOSITORY ROOT, because a pnpm workspace is one unit:
#   docker build -f docker/api.Dockerfile -t ariadna-api .

ARG NODE_VERSION=22-bookworm-slim

# ---------------------------------------------------------------------------
# Stage 1: install, with everything
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN corepack enable

# `openssl` here is not a build tool: Prisma picks which query engine binary to
# download by sniffing the OpenSSL version of the machine it generates on. A
# build stage without it guesses 1.1.x, the runtime stage has 3.0.x, and the
# first query in the container fails with an engine that is not there. Verified
# the hard way, by running it.
RUN apt-get update \
    && apt-get install --no-install-recommends --yes openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Manifests first. This layer is what takes the minutes, and it changes only
# when a dependency does — editing a route must not reinstall the world.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY packages/domain-contract-tests/package.json packages/domain-contract-tests/
COPY apps/api/package.json apps/api/

# `--prod` here rather than a prune afterwards: an install that never puts
# typescript, vitest or the contract tests on disk is smaller and faster than
# one that puts them there and deletes them. `--ignore-scripts` holds back the
# `postinstall` that runs `prisma generate`, which needs the schema, which is
# copied next.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY packages/domain packages/domain
COPY apps/api apps/api

# The Prisma client is generated code and belongs to the image, not to the
# repository: generating it here means the container can never run against a
# client built from a different schema than the one it ships with.
RUN pnpm --filter @ariadna/api exec prisma generate

# ---------------------------------------------------------------------------
# Stage 2: what actually runs
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# `openssl` is what Prisma's query engine links against; `ca-certificates` is
# for the outbound TLS the sidecar probe may use. No compiler, no pnpm, no
# Python, and — the point of ADR 4 — no ONNX runtime and no 176 MB model.
RUN apt-get update \
    && apt-get install --no-install-recommends --yes \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    # A container's loopback is not the host's. The process still must not be
    # reachable from the home network, and in this stack that is the compose
    # file's job: it publishes the port on 127.0.0.1 only.
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/data/db/ariadna.db \
    ARIADNA_PHOTO_ROOT=/data/photos

WORKDIR /repo

COPY --from=build --chown=node:node /repo /repo
COPY --chown=node:node docker/api-entrypoint.sh /usr/local/bin/ariadna-entrypoint

# Both of these are MOUNT POINTS, and they exist in the image only so that a
# fresh named volume inherits the right ownership. Nothing durable may live
# inside the image: an upgrade replaces the image, and a photo directory inside
# it would be replaced with the photos still in it.
RUN mkdir -p /data/photos /data/db \
    && chown -R node:node /data \
    && chmod +x /usr/local/bin/ariadna-entrypoint

USER node
WORKDIR /repo/apps/api

EXPOSE 3000

# The API's own answer to "are you alive", which is deliberately NOT the one
# about background removal: this container is healthy whether or not a sidecar
# exists, which is the whole of ADR 4 expressed as a healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/ariadna-entrypoint"]
CMD ["node_modules/.bin/tsx", "src/server.ts"]
