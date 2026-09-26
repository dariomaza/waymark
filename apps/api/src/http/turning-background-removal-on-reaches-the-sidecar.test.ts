import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * # Turning background removal on reaches the sidecar
 *
 * Background removal is switched on by adding one compose file,
 * `docker-compose.image-processing.yml`, on top of `docker-compose.yml`. That
 * file does two things that have to agree: it starts the sidecar, and it tells
 * the API the address to reach it at. Whether that address works is decided by
 * a THIRD thing, in the other file — the network the API runs on.
 *
 * They drifted apart once, silently. The base file moved the API into the
 * host's network namespace (so the login rate limiter sees real callers, ADR
 * 7), and the overlay, written a day earlier, kept pointing it at
 * `http://image-processor:8000`: a compose service name, resolvable only on the
 * project network the API had just left, for a port that was never published.
 * Nothing fails at boot. Every photo is simply unreachable, retried with a
 * backoff, and ends up `FAILED` — the "broken interesting state" both files'
 * comments warn about, reached by a change to neither of the lines that
 * mention it.
 *
 * Nothing in TypeScript can see this: the address is a string in YAML and the
 * failure only exists at runtime, on the box, with the overlay applied. So this
 * reads both files and asserts on the RELATIONSHIP between them — whichever
 * network the API is on, the address it is given is one it can reach, and the
 * sidecar is reachable at that address from nowhere wider than it has to be.
 *
 * Parsed as text, like the other compose guards in this directory, rather than
 * with a YAML dependency: the shape read here is two levels deep and the file
 * is ours.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

const BASE = "docker-compose.yml";
const OVERLAY = "docker-compose.image-processing.yml";

/** Drops a trailing `# comment` and surrounding whitespace from one line. */
const withoutComment = (line: string): string => line.replace(/\s+#.*$/u, "").trim();

/**
 * The lines of one service, from its `  name:` line to the next line at the
 * same or a shallower indentation. Comment-only lines are dropped, so a comment
 * that happens to mention `network_mode: host` is never mistaken for the key.
 */
const serviceBlock = (compose: string, file: string, service: string): string[] => {
  const lines = compose.split("\n");
  const start = lines.indexOf(`  ${service}:`);

  expect(start, `${file} no longer has a \`${service}\` service`).toBeGreaterThan(-1);

  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,2}\S/u.test(line)) break;
    if (/^\s*#/u.test(line) || line.trim() === "") continue;
    block.push(line);
  }

  return block;
};

const scalar = (block: string[], key: string): string | undefined => {
  const line = block.find((l) => l.trimStart().startsWith(`${key}:`));

  return line === undefined
    ? undefined
    : withoutComment(line.slice(line.indexOf(":") + 1)).replace(/^["']|["']$/gu, "");
};

/** The `- "…"` entries under one list key, unquoted. */
const listUnder = (block: string[], key: string): string[] => {
  const at = block.findIndex((l) => l.trim() === `${key}:`);
  if (at === -1) return [];

  const indent = block[at]!.length - block[at]!.trimStart().length;
  const entries: string[] = [];
  for (const line of block.slice(at + 1)) {
    if (line.length - line.trimStart().length <= indent) break;
    entries.push(withoutComment(line).replace(/^-\s*/u, "").replace(/^["']|["']$/gu, ""));
  }

  return entries;
};

/**
 * One published port, in compose's short syntax: `[ip:]host:container`. An
 * entry with no ip is published on every interface of the box.
 */
interface Published {
  readonly ip: string | undefined;
  readonly host: string;
  readonly container: string;
}

const parsePublished = (entry: string): Published => {
  const parts = entry.split(":");

  return parts.length === 3
    ? { ip: parts[0], host: parts[1]!, container: parts[2]! }
    : { ip: undefined, host: parts[0]!, container: parts[parts.length - 1]! };
};

const base = read(BASE);
const overlay = read(OVERLAY);

const baseApi = serviceBlock(base, BASE, "api");
const overlayApi = serviceBlock(overlay, OVERLAY, "api");
const sidecar = serviceBlock(overlay, OVERLAY, "image-processor");

/** The overlay wins over the base for a key both of them set, as in compose. */
const apiNetworkMode = scalar(overlayApi, "network_mode") ?? scalar(baseApi, "network_mode");

const processorUrlLine = overlayApi.find((l) =>
  l.trimStart().startsWith("WAYMARK_IMAGE_PROCESSOR_URL:"),
);
const processorUrl = new URL(
  withoutComment(processorUrlLine?.slice(processorUrlLine.indexOf(":") + 1) ?? "")
    .replace(/^["']|["']$/gu, "") || "invalid:",
);

/** What uvicorn listens on inside the sidecar, read from its own image. */
const sidecarListensOn = (): string => {
  const port = /"--port",\s*"(\d+)"/u.exec(read("services/image-processor/Dockerfile"))?.[1];

  expect(port, "the sidecar's Dockerfile no longer says which port it listens on").toBeDefined();

  return port!;
};

const LOOPBACK = "127.0.0.1";

describe("turning background removal on reaches the sidecar", () => {
  /**
   * The guard's own guard. Every assertion below reads a value out of a slice,
   * and a slice that found nothing would make the loopback branch vacuous. So
   * this pins that the premise was actually read: the overlay does name an
   * address, and the API's network mode came from a real key.
   */
  it("reads the address the overlay gives the API, and the network the API is on", () => {
    expect(processorUrlLine, `${OVERLAY} no longer tells the API where the sidecar is`).toBeDefined();
    expect(processorUrl.protocol).toBe("http:");
    expect(apiNetworkMode, `${BASE} no longer says which network the API is on`).toBeDefined();
  });

  describe("with the API in the host's network namespace", () => {
    const inHostNamespace = apiNetworkMode === "host";

    /**
     * A process in the host namespace has the host's resolver, which has never
     * heard of a compose service, and no route into the project network. The
     * only address of the sidecar it can reach is one the host itself owns.
     */
    it("is given a loopback address, because a compose service name does not resolve there", () => {
      if (!inHostNamespace) return;

      expect(processorUrl.hostname).toBe(LOOPBACK);
    });

    /**
     * An address on loopback is only half of it: something has to be listening
     * there. The sidecar lives on the project network, so the host's loopback
     * reaches it only through a port compose publishes — this one, onto the
     * port uvicorn actually binds inside the container.
     */
    it("finds the sidecar published on exactly that port", () => {
      if (!inHostNamespace) return;

      const published = listUnder(sidecar, "ports").map(parsePublished);
      const port = processorUrl.port || "80";

      expect(published).toContainEqual({
        ip: LOOPBACK,
        host: port,
        container: sidecarListensOn(),
      });
    });

    /**
     * Published is not the same as exposed. A port with no address, or with
     * 0.0.0.0, is on every interface the box has — an unauthenticated image
     * endpoint handed to every device in the house, when the only caller that
     * should ever exist is the API on the same machine.
     */
    it("publishes the sidecar on loopback and nowhere wider", () => {
      if (!inHostNamespace) return;

      for (const entry of listUnder(sidecar, "ports")) {
        expect(parsePublished(entry).ip, `\`${entry}\` publishes beyond loopback`).toBe(
          LOOPBACK,
        );
      }
    });
  });

  describe("with the API on the project network", () => {
    /**
     * The other topology, kept honest rather than left unguarded: on the
     * project network the service name is exactly the right address, and a
     * loopback one would be the API's own container talking to itself.
     */
    it("is given the sidecar's service name", () => {
      if (apiNetworkMode === "host") return;

      expect(processorUrl.hostname).toBe("image-processor");
    });
  });
});
