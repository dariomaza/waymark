import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * # The plumbing that carries a commit into the running container
 *
 * `GET /health` reports `WAYMARK_COMMIT`, and `loadConfig` is tested on that.
 * Neither of them can notice the two links before it, because neither is
 * TypeScript:
 *
 * 1. `docker/api.Dockerfile` has to accept the build argument in the RUNTIME
 *    stage and turn it into an environment variable. A `--build-arg` naming an
 *    `ARG` no stage declares is not an error — Docker prints a warning nobody
 *    reads and builds an image that says `null` for ever.
 * 2. `docker-compose.yml` has to pass it, because the deploy runs
 *    `docker compose build` and not `docker build`. CI builds with plain
 *    `docker build` and so cannot see this line at all.
 *
 * CI now runs the built image and asserts it reports the commit it was built
 * with, which proves link 1 for real rather than by string match. This file is
 * the laptop-speed guard in front of that, and the only cover link 2 has.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const dockerfile = readFileSync(join(repoRoot, "docker", "api.Dockerfile"), "utf8");
const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8");

/**
 * The stage is sliced backwards from a line that can only be in it, exactly as
 * `the-image-carries-every-package-it-builds.test.ts` does — and for the reason
 * that file records in blood. Its first version anchored on `COPY --from=web`,
 * which lives in the runtime stage, while meaning to measure the web stage: it
 * inspected the wrong slice and failed against a Dockerfile that was right. An
 * anchor has to be inside the thing being measured, and the test has to prove
 * it landed there.
 */
const stageContaining = (line: string): string => {
  const at = dockerfile.indexOf(line);

  expect(at, `the Dockerfile no longer has \`${line}\``).toBeGreaterThan(-1);

  const start = dockerfile.lastIndexOf("\nFROM ", at);
  const nextFrom = dockerfile.indexOf("\nFROM ", at);

  return dockerfile.slice(
    start === -1 ? 0 : start,
    nextFrom === -1 ? dockerfile.length : nextFrom,
  );
};

/** Everything from `build:` down to the `image:` that closes it. */
const composeBuildBlock = (): string => {
  const start = compose.indexOf("    build:");
  expect(start, "the api service no longer builds from a Dockerfile").toBeGreaterThan(
    -1,
  );

  const end = compose.indexOf("\n    image:", start);
  expect(end, "the api service no longer names an image").toBeGreaterThan(start);

  return compose.slice(start, end);
};

describe("the image is told which commit it is", () => {
  const runtimeStage = stageContaining(
    'ENTRYPOINT ["/usr/local/bin/waymark-entrypoint"]',
  );

  /**
   * The guard's own guard, and not a formality. Every assertion below is a
   * `toContain` against a slice, and a slice taken from the wrong stage — or
   * from the whole file — would pass every one of them while measuring
   * nothing. So this pins what the slice IS: it holds the lines only the
   * runtime stage has, and none of the lines that belong to a build stage.
   */
  it("is looking at the runtime stage and not at a build stage", () => {
    expect(runtimeStage).toContain("USER node");
    expect(runtimeStage).toContain("HEALTHCHECK");
    expect(runtimeStage).not.toContain("pnpm install");
    expect(runtimeStage).not.toContain("pnpm --filter @waymark/web build");
  });

  /**
   * An `ARG` before the first `FROM` is global and still invisible inside a
   * stage that does not redeclare it. This is the redeclaration.
   */
  it("accepts the commit as a build argument in the stage that runs", () => {
    expect(runtimeStage).toContain("ARG WAYMARK_COMMIT");
  });

  /**
   * A build argument is gone the moment the build ends. The process reads an
   * environment variable, so the stage has to turn one into the other.
   */
  it("turns it into the environment variable the process reads", () => {
    expect(runtimeStage).toContain("ENV WAYMARK_COMMIT=${WAYMARK_COMMIT}");
  });

  /**
   * Default empty rather than absent. An unset `--build-arg` against a
   * defaulted `ARG` builds cleanly and the API answers `null`, which is the
   * whole of the "a local build must not fail over a label" decision expressed
   * in one character. Without the default, `${WAYMARK_COMMIT}` still expands to
   * nothing — but the image then depends on Docker's substitution of an
   * undeclared value, which is a thing to remember rather than a thing written
   * down.
   */
  it("defaults it to empty, so a build that says nothing still builds", () => {
    expect(runtimeStage).toMatch(/ARG WAYMARK_COMMIT=""/u);
  });

  /**
   * Last in its stage on purpose. Everything above it — apt, the copies, the
   * chown — is identical between two deploys of the same tree, and an `ENV`
   * placed earlier would invalidate all of it every time the commit changed,
   * which is every deploy.
   */
  it("sets it after the expensive layers, so a new commit does not rebuild them", () => {
    expect(runtimeStage.indexOf("ENV WAYMARK_COMMIT=")).toBeGreaterThan(
      runtimeStage.indexOf("COPY --from=web"),
    );
  });

  /**
   * The deploy builds through compose, so an argument compose does not forward
   * never reaches the Dockerfile at all — and the image would be correct, the
   * Dockerfile would be correct, and the running container would still say
   * `null`.
   */
  it("is forwarded by the compose file that the deploy actually builds with", () => {
    const build = composeBuildBlock();

    expect(build).toContain("args:");
    expect(build).toContain("WAYMARK_COMMIT: ${WAYMARK_COMMIT:-}");
  });

  /**
   * `:-` and not a bare `${WAYMARK_COMMIT}`. Compose warns about an unset
   * variable and substitutes empty anyway, so the two behave the same and only
   * one of them says so on purpose. The empty default is what lets anybody
   * bring the stack up by hand without knowing this variable exists.
   */
  it("lets the stack come up by hand with the variable unset", () => {
    expect(composeBuildBlock()).not.toContain("WAYMARK_COMMIT: ${WAYMARK_COMMIT}\n");
  });
});
