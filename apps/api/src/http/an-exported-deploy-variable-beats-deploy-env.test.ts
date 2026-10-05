import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/**
 * # An exported deploy variable beats `scripts/deploy.env`
 *
 * `scripts/deploy.sh` reads its target from the operator's gitignored
 * `scripts/deploy.env`, and says "real environment variables still win over
 * the file". For a while that was false: the file was sourced with `set -a`,
 * and its plain `NAME=value` lines overwrote whatever the environment had, so
 * `WAYMARK_DEPLOY_REMOTE=other@box scripts/deploy.sh` quietly deployed to the
 * box in the file.
 *
 * The script reads `deploy.env` from its own directory, so this copies it into
 * a scratch `scripts/` directory next to a `deploy.env` written here, and runs
 * it with an environment holding nothing but `PATH` and what each case sets.
 * It never reaches the network or git: the first refusals the script makes —
 * a required variable missing, or `WAYMARK_DEPLOY_IMAGE_PROCESSING` not 0 or 1
 * — happen before any tool is looked for, and both name what the script
 * resolved. An invalid image-processing value is the probe because the refusal
 * quotes it back.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const REQUIRED = {
  WAYMARK_DEPLOY_REMOTE: "file@box",
  WAYMARK_DEPLOY_PATH: "/srv/from-file",
  WAYMARK_DEPLOY_PUBLIC_URL: "https://from-file.example",
  WAYMARK_DEPLOY_GITHUB_REPO: "someone/from-file",
};

const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs a copy of deploy.sh beside a `deploy.env` with these lines. */
const deployWith = (deployEnv: Record<string, string>, environment: Record<string, string>) => {
  const scratch = mkdtempSync(join(tmpdir(), "waymark-deploy-env-"));
  scratchDirs.push(scratch);
  const scripts = join(scratch, "scripts");
  mkdirSync(scripts);
  copyFileSync(join(repoRoot, "scripts", "deploy.sh"), join(scripts, "deploy.sh"));
  writeFileSync(
    join(scripts, "deploy.env"),
    Object.entries(deployEnv)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  );

  const run = spawnSync("bash", [join(scripts, "deploy.sh"), "--check"], {
    cwd: scratch,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...environment },
  });
  return { status: run.status, stderr: run.stderr };
};

describe("deploy.sh reading scripts/deploy.env", () => {
  it("lets a variable exported in the environment win over the same one in the file", () => {
    const run = deployWith(
      { ...REQUIRED, WAYMARK_DEPLOY_IMAGE_PROCESSING: "from-file" },
      { WAYMARK_DEPLOY_IMAGE_PROCESSING: "from-environment" },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("WAYMARK_DEPLOY_IMAGE_PROCESSING is `from-environment`");
  });

  it("still takes from the file what the environment leaves unset", () => {
    const run = deployWith({ ...REQUIRED, WAYMARK_DEPLOY_IMAGE_PROCESSING: "from-file" }, {});

    expect(run.status).toBe(1);
    // Reaching the image-processing refusal means every required variable came
    // from the file; quoting `from-file` means that one did too.
    expect(run.stderr).not.toContain("is not set");
    expect(run.stderr).toContain("WAYMARK_DEPLOY_IMAGE_PROCESSING is `from-file`");
  });

  it("refuses, naming the variable, when neither the file nor the environment has it", () => {
    const { WAYMARK_DEPLOY_REMOTE: _omitted, ...withoutRemote } = REQUIRED;
    const run = deployWith(withoutRemote, {});

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("WAYMARK_DEPLOY_REMOTE is not set");
  });
});
