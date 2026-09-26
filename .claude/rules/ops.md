---
paths:
  - ".github/**"
  - "docker/**"
  - "scripts/**"
  - "docker-compose*.yml"
  - "release-please-config.json"
  - ".release-please-manifest.json"
---

# CI, images, deploys and releases

- **`ci.yml`** runs typecheck, every suite, and builds AND runs the API image.
  It is also a reusable workflow (`workflow_call`); `release.yml` calls it rather
  than copying its steps. Its `push` trigger is branches only, so a tag does not
  verify the same commit twice.
- **`docker/api.Dockerfile` enumerates workspace packages by hand**, twice per
  stage (manifest, then source). A guard test derives the list from the
  manifests: runtime deps need both lines, dev deps only the manifest.
- **`scripts/deploy.sh`** (ADR 23) reads the target from gitignored
  `scripts/deploy.env`. It refuses on a dirty tree, an unpushed commit, or CI
  that is not `success` for that SHA — queried from the public GitHub API, no
  token — then builds before recreating the container and proves `/health`
  names the new commit. `WAYMARK_DEPLOY_WITHOUT_GITHUB=1` skips only the
  GitHub-dependent gates; nothing skips the clean-tree check or the proof.
  `WAYMARK_DEPLOY_IMAGE_PROCESSING=1` deploys with the background-removal
  overlay by exporting `COMPOSE_FILE` for every remote compose command.
- **The API runs in the host's network namespace**, so anything it calls must
  be reachable from the host: the rembg sidecar is published on
  `127.0.0.1:8001` and the API is given that address, never a compose service
  name. `turning-background-removal-on-reaches-the-sidecar.test.ts` guards it.
- **Releases**: `release-please.yml` keeps a release PR open; merging it tags
  and calls `release.yml`, which verifies, builds on EAS, checks the build is the
  tagged commit and version, and attaches the APK. **A tag created with
  `GITHUB_TOKEN` triggers no workflow** — that is why the call is direct.
  Needs the `EXPO_TOKEN` secret. The keystore never leaves EAS.
- **Validate workflows with `actionlint`** before pushing; a broken one says
  nothing until the event that should run it.
