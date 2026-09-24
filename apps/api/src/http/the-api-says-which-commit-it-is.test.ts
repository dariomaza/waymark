import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApi, type TestApi } from "./testing/test-api.js";

/**
 * # The running process says which commit it is
 *
 * A deploy used to be verified by eye: rsync, `docker compose up -d --build`,
 * open the hostname, and compare the served bundle's hashed filename against
 * the one in `apps/web/dist`. That is a proxy in two directions. It is EMPTY
 * when only the API changed — the bundle is byte-identical and the filename
 * says nothing — and even when it differs it answers "these bytes are not the
 * bytes I had before", never "this is the commit I deployed".
 *
 * The failure it missed is the one that happened: the image failed to build,
 * `docker compose up -d --build` left the previous container running, and the
 * old container kept answering 200. Every signal a person looks at said
 * healthy.
 *
 * So the commit is baked into the image as a build argument and repeated here.
 * `scripts/deploy.sh` then asserts equality against the commit it just shipped,
 * which is a fact and not an inference.
 *
 * It lives on `/health` rather than on a route of its own, and that is the
 * decision worth defending. `/health` is the one unauthenticated route, it is
 * what the image's own `HEALTHCHECK` probes, and it is what anything verifying
 * a deploy polls first to learn the container is up. Putting the identity in
 * the same answer makes "is it alive" and "which code is it" one question with
 * one answer: there is no way to check that the container came up without also
 * learning what came up. A sibling route could be polled, forgotten, or removed
 * by somebody who saw no caller for it — and the deploy would go back to being
 * inferred. See ADR 23.
 */
describe("the API says which commit it is", () => {
  let api: TestApi;

  afterAll(async () => {
    await api.destroy();
  });

  describe("built from a known commit", () => {
    const COMMIT = "6a852af0f7335499e407620aff6b46dfc56999c6";

    beforeAll(async () => {
      api = await createTestApi({ commit: COMMIT });
    });

    beforeEach(async () => {
      await api.reset();
    });

    it("reports it beside the status, in the answer the probe already reads", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok", commit: COMMIT });
    });

    /**
     * The deploy script runs on a laptop with no credentials for this
     * deployment, against a hostname on the public internet. A commit that
     * could only be read with a session would need the gate to hold a secret,
     * and a gate that needs a secret is a gate somebody eventually skips.
     *
     * The cost is named rather than hidden: this publishes which commit of a
     * public repository is running. See ADR 23.
     */
    it("answers a caller holding nothing at all, because the gate holds no credentials", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/health",
        headers: {},
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { commit: string | null }).commit).toBe(COMMIT);
    });
  });

  describe("built without being told", () => {
    beforeAll(async () => {
      api = await createTestApi();
    });

    beforeEach(async () => {
      await api.reset();
    });

    /**
     * A hard refusal at boot was considered and rejected. `docker build` on a
     * laptop, and every `docker compose up` a contributor runs, would then have
     * to know about a build argument that exists for one deployment on one NAS.
     * Refusing to start over a label — a value this process never reads, never
     * branches on and never hands to anything — would let the identity field
     * take the inventory down, which is strictly worse than the problem it was
     * added to solve.
     *
     * So the image builds, the container runs, and it says it does not know.
     * The refusal lives in `scripts/deploy.sh`, where `null` is not equal to
     * the commit being deployed and the deploy fails. Honest in the process,
     * strict at the gate.
     */
    it("says null rather than refusing to start", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok", commit: null });
    });

    /**
     * Two different facts, and the deploy script tells them apart. A container
     * from before this field existed answers with no `commit` key at all; one
     * built without the argument answers with the key and `null`. The first
     * means "this image predates the gate", the second means "this image was
     * built without saying what it is", and they are fixed by different
     * actions — so the key is always present rather than omitted.
     */
    it("always carries the key, so absent and unknown are different answers", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(Object.keys(response.json() as object)).toContain("commit");
    });
  });
});
