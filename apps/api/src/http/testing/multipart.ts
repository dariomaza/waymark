import { randomUUID } from "node:crypto";

/**
 * Builds a real `multipart/form-data` body.
 *
 * `app.inject` takes a payload and headers, and nothing else — which is what
 * makes these tests worth having: the bytes below go through the same parser,
 * the same limits and the same error handling as a phone's upload. Constructing
 * the body by hand keeps the `Content-Type` a value the TEST chooses, which is
 * exactly the lever the "the declared type is not believed" cases need.
 */

export interface MultipartFilePart {
  readonly field: string;
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Buffer;
}

export interface MultipartRequestBody {
  readonly contentType: string;
  readonly payload: Buffer;
}

export const multipartBody = (part: MultipartFilePart): MultipartRequestBody => {
  const boundary = `----waymark${randomUUID().replace(/-/gu, "")}`;

  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${part.field}"; filename="${part.filename}"\r\n` +
      `Content-Type: ${part.contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat([head, part.bytes, tail]),
  };
};
