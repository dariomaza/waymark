import "@testing-library/jest-dom/vitest";

import { Blob as NodeBlob, File as NodeFile } from "node:buffer";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { sessionStore } from "../auth/session-store.js";
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
 *
 * The one thing Node's `FormData` will not do is what a DOM does with it:
 * React builds `new FormData(formElement)` on every submit, and the Node
 * constructor refuses arguments outright. The subclass below closes that gap
 * by reading the form's own fields, which keeps both sides working with the
 * same object model.
 */
globalThis.File = NodeFile as unknown as typeof File;
globalThis.Blob = NodeBlob as unknown as typeof Blob;

const probe = await new Response(
  '--b\r\nContent-Disposition: form-data; name="file"; filename="probe"\r\n\r\nx\r\n--b--\r\n',
  { headers: { "content-type": "multipart/form-data; boundary=b" } },
).formData();

const NodeFormData = probe.constructor as new () => FormData;

class DomAwareFormData extends NodeFormData {
  constructor(form?: HTMLFormElement) {
    super();

    for (const element of form?.elements ?? []) {
      const field = element as HTMLInputElement;
      const skip =
        field.name === "" ||
        field.disabled ||
        field.type === "submit" ||
        field.type === "button" ||
        // Files are left out on purpose: nothing in this app submits a form
        // to build an upload, and a foreign `File` copied in here would be
        // re-encoded into something that is no longer those bytes.
        field.type === "file" ||
        ((field.type === "checkbox" || field.type === "radio") && !field.checked);

      if (!skip) {
        this.append(field.name, field.value);
      }
    }
  }
}

globalThis.FormData = DomAwareFormData as unknown as typeof FormData;

beforeAll(() => {
  // A request no test declared a handler for is a test that does not know what
  // it depends on, so it fails rather than silently hitting the network.
  apiServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  apiServer.resetHandlers();
  // The session outlives a render on purpose — it is in storage — so a test
  // that signed in must not decide the next one's starting state.
  sessionStore.clear();
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
