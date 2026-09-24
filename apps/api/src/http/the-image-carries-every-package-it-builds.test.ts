import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * # The Dockerfile's COPY list, checked against the workspace
 *
 * `docker/api.Dockerfile` names every workspace package it needs, by hand, in
 * two places per stage: the manifest first for the slow install layer, then
 * the source. Nothing typechecks a Dockerfile, so that list is the one part of
 * this repository where adding a package and forgetting to say so compiles,
 * tests green, pushes, and then fails inside an image nobody is watching.
 *
 * It has now done exactly that three times. The last one was `@waymark/tokens`,
 * added the same day: every suite passed, the push succeeded, the image failed
 * at `pnpm --filter @waymark/web build`, and **the old container kept running
 * and kept answering 200** — so the deployment looked healthy while serving the
 * previous bundle.
 *
 * So the list is derived from the manifests here rather than trusted. A client
 * that gains a workspace dependency fails this test on the laptop, in seconds,
 * instead of in a build log an hour later.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const dockerfile = readFileSync(join(repoRoot, "docker", "api.Dockerfile"), "utf8");

/**
 * The workspace packages an app depends on, split the way the image needs them.
 *
 * A runtime dependency has to be there twice — the manifest for the install
 * layer, the source for the build. A dev one needs only the manifest, because
 * `pnpm install --frozen-lockfile` refuses a lockfile whose workspace is short
 * a package, and then nothing in the image ever imports it: the tests that use
 * `@waymark/domain-contract-tests` do not run in a container.
 *
 * Demanding source for both is what this test did first, and it failed on a
 * Dockerfile that was right.
 */
const workspaceDepsOf = (
  app: string,
): { readonly runtime: readonly string[]; readonly dev: readonly string[] } => {
  const manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = JSON.parse(readFileSync(join(repoRoot, "apps", app, "package.json"), "utf8"));

  const ours = (from: Record<string, string> | undefined): readonly string[] =>
    Object.entries(from ?? {})
      .filter(([name, range]) => name.startsWith("@waymark/") && range.startsWith("workspace:"))
      .map(([name]) => name.slice("@waymark/".length));

  return { runtime: ours(manifest.dependencies), dev: ours(manifest.devDependencies) };
};

/**
 * The stage is found by the line that builds it rather than by a name, because
 * the name is the thing most likely to be edited, and a test that stops finding
 * its subject silently passes.
 */
const stageEndingWith = (command: string): string => {
  const end = dockerfile.indexOf(command);

  expect(end, `the Dockerfile no longer runs \`${command}\``).toBeGreaterThan(-1);

  const start = dockerfile.lastIndexOf("\nFROM ", end);

  return dockerfile.slice(start === -1 ? 0 : start, end);
};

describe("the image carries every package it builds", () => {
  /**
   * The two lines fail differently. Without the manifest,
   * `pnpm install --frozen-lockfile` refuses the lockfile; without the source,
   * the install succeeds and the build cannot resolve the import.
   */
  const declares = (stage: string, pkg: string): void => {
    expect(stage, `packages/${pkg}/package.json is not copied`).toContain(
      `COPY packages/${pkg}/package.json packages/${pkg}/`,
    );
  };

  const carries = (stage: string, pkg: string): void => {
    declares(stage, pkg);
    expect(stage, `packages/${pkg} source is not copied`).toContain(
      `COPY packages/${pkg} packages/${pkg}`,
    );
  };

  it("copies every workspace package the web client depends on", () => {
    const stage = stageEndingWith("pnpm --filter @waymark/web build");
    const { runtime, dev } = workspaceDepsOf("web");

    for (const pkg of runtime) {
      carries(stage, pkg);
    }

    for (const pkg of dev) {
      declares(stage, pkg);
    }
  });

  /**
   * Anchored on `prisma generate`, which is the last thing the API's BUILD
   * stage does. The first version of this test anchored on `COPY --from=web`,
   * which lives in the RUNTIME stage — so it inspected a slice containing no
   * package copies at all and failed against a Dockerfile that was correct.
   * An anchor has to be inside the thing being measured.
   */
  it("copies every workspace package the API depends on", () => {
    const stage = stageEndingWith("pnpm --filter @waymark/api exec prisma generate");
    const { runtime, dev } = workspaceDepsOf("api");

    for (const pkg of runtime) {
      carries(stage, pkg);
    }

    for (const pkg of dev) {
      declares(stage, pkg);
    }
  });

  /**
   * The guard's own guard. If `workspaceDepsOf` ever answers nothing — a
   * renamed scope, a moved manifest, a parse that quietly yields `{}` — every
   * test above passes by iterating an empty list, which is the shape of a test
   * that has stopped asking anything at all.
   *
   * `tokens` is named because it is the package whose absence caused the
   * failure this file exists to prevent, and `domain-contract-tests` because
   * it is the one that proved the first version of this test too strict.
   */
  it("is looking at real dependencies", () => {
    expect(workspaceDepsOf("web").runtime).toContain("tokens");
    expect(workspaceDepsOf("api").runtime).toContain("domain");
    expect(workspaceDepsOf("api").dev).toContain("domain-contract-tests");
  });
});
