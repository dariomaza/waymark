import "@testing-library/jest-dom/vitest";

import { Blob as NodeBlob, File as NodeFile } from "node:buffer";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { apiServer } from "./api-server.js";

/**
 * # One file model, so a photo upload is a real multipart request
 *
 * jsdom brings its own `FormData`, `File` and `Blob`, and Node's `fetch` —
 * which is what actually sends the request here — only recognises its own.
 * Handed a foreign `FormData`, it does not refuse: it stringifies it, sends
 * `[object FormData]` and drops the multipart content type, so the upload
 * fails on the far side for a reason that has nothing to do with the code
 * under test.
 *
 * Node exports `File` and `Blob` publicly; `FormData` it does not, so the one
 * `fetch` understands is recovered by parsing a multipart body with Node's own
 * `Response`. Doing this here rather than working around it in the client
 * matters: the client must build the same request a browser would, and the
 * test must send it through the same machinery MSW intercepts.
 */
globalThis.File = NodeFile as unknown as typeof File;
globalThis.Blob = NodeBlob as unknown as typeof Blob;

const probe = await new Response(
  '--b\r\nContent-Disposition: form-data; name="file"; filename="probe"\r\n\r\nx\r\n--b--\r\n',
  { headers: { "content-type": "multipart/form-data; boundary=b" } },
).formData();

globalThis.FormData = probe.constructor as typeof FormData;

beforeAll(() => {
  // A request no test declared a handler for is a test that does not know what
  // it depends on, so it fails rather than silently hitting the network.
  apiServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  apiServer.resetHandlers();
});

afterAll(() => {
  apiServer.close();
});

/**
 * jsdom has no object URLs, and the photo screens live on them: every image in
 * this app is fetched with the session token and handed to the DOM as a blob
 * (see `photos/`). These stand in for the browser's implementation so a test
 * can still assert which bytes an `<img>` was pointed at.
 */
let objectUrls = 0;
const revoked = new Set<string>();

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = (): string => `blob:ariadna/${(objectUrls += 1)}`;
  URL.revokeObjectURL = (value: string): void => {
    revoked.add(value);
  };
}

export const wasRevoked = (value: string): boolean => revoked.has(value);
