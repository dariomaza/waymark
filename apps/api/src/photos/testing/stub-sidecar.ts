import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A REAL HTTP server standing in for the rembg sidecar.
 *
 * Not a mock of the client. Mocking `fetch`, or the adapter's own HTTP helper,
 * would prove that the adapter calls a function this test also wrote — while
 * every interesting property of talking to a container over a network lives
 * exactly where the mock replaced it: a connection refused, a socket that
 * accepts and never answers, a 500 with an HTML error page in the body, a
 * response that claims to be a PNG and is not.
 *
 * So the stub listens on a real loopback port, the adapter really connects, and
 * the failure modes are produced by doing the thing rather than by describing
 * it.
 */

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly contentType: string | undefined;
  readonly body: Buffer;
}

export type SidecarHandler = (
  request: IncomingMessage,
  reply: ServerResponse,
  body: Buffer,
) => void;

export interface StubSidecar {
  /** Origin only, exactly as `ARIADNA_IMAGE_PROCESSOR_URL` would carry it. */
  readonly url: string;
  readonly requests: readonly RecordedRequest[];
  /** Replaces the handler for the next requests. */
  respondWith(handler: SidecarHandler): void;
  close(): Promise<void>;
}

/** The happy path: a cutout, as `rembg` returns it. */
export const respondsWithCutout = (png: Buffer): SidecarHandler =>
  (_request, reply) => {
    reply.writeHead(200, { "content-type": "image/png" });
    reply.end(png);
  };

/** The sidecar looked at the image and found nothing to cut out. */
export const declines: SidecarHandler = (_request, reply) => {
  reply.writeHead(204).end();
};

export const respondsWith = (status: number, body = "", type = "text/plain"): SidecarHandler =>
  (_request, reply) => {
    reply.writeHead(status, { "content-type": type });
    reply.end(body);
  };

/** 200, `image/png`, and bytes that are not an image at all. */
export const respondsWithGarbage: SidecarHandler = (_request, reply) => {
  reply.writeHead(200, { "content-type": "image/png" });
  reply.end("<html><body>502 Bad Gateway</body></html>");
};

/** Accepts the request, answers nothing, ever. */
export const hangs: SidecarHandler = () => {
  // Deliberately empty: the socket stays open with no response on it.
};

export const startStubSidecar = async (
  initial: SidecarHandler = respondsWith(200),
): Promise<StubSidecar> => {
  const requests: RecordedRequest[] = [];
  let handler = initial;

  const server: Server = createServer((request, reply) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        contentType: request.headers["content-type"],
        body,
      });
      handler(request, reply, body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,

    respondWith(next: SidecarHandler): void {
      handler = next;
    },

    async close(): Promise<void> {
      // A hung request holds a socket open, and `close` waits for every one of
      // them. Dropping them is what makes the timeout cases finish.
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

/**
 * An address nothing is listening on.
 *
 * Bound and released, rather than picked out of the air, so the port is one the
 * operating system just confirmed is free — a hard-coded number is a test that
 * fails on whichever machine happens to be running something there.
 */
export const anUnusedSidecarUrl = async (): Promise<string> => {
  const stub = await startStubSidecar();
  const { url } = stub;
  await stub.close();

  return url;
};
