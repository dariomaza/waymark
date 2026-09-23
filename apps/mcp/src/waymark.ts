import { AuthScheme, createWaymarkClient, type WaymarkClient } from "@waymark/api-client";

import type { Configuration } from "./configuration.js";

/**
 * # This package speaks no HTTP
 *
 * Not one line of it. `@waymark/api-client` was built shared for the browser
 * and the phone, and this is its third consumer — which is the only thing that
 * turns "the client is shared" from a claim into a fact. A second HTTP module
 * written here would have been a second copy of the error envelope, the URL
 * building and the 409/422 split, and the first time the API changed one of
 * them, two of the three consumers would have agreed and one would have been
 * quietly wrong.
 *
 * What this file does is the one thing that IS different about this consumer:
 * it holds a machine token rather than a person's session, so it asks the
 * shared client for the `Machine` scheme (ADR 17).
 */

/**
 * A photo has no meaning here, and `never` is how that is said in the type
 * system rather than in a comment.
 *
 * `TFile` is the one thing `@waymark/api-client` deliberately leaves open: a
 * browser holds a `File`, a phone holds a `file://` URI. An MCP server over
 * stdio holds neither — it is a conversation, not a filesystem — so there is no
 * third answer to give. Choosing `never` makes `uploadItemPhoto` a method that
 * cannot be called rather than one that throws when it is: the callback below
 * is unreachable, and the compiler is what says so.
 */
export type McpApiClient = WaymarkClient<never>;

export const createMcpApiClient = (configuration: Configuration): McpApiClient =>
  createWaymarkClient<never>({
    baseUrl: configuration.baseUrl,
    scheme: AuthScheme.Machine,
    // Read per call like every other consumer's, though this one never
    // changes: a machine token is not refreshed, it is revoked.
    token: () => configuration.token,
    appendPhoto: () => {
      /* Unreachable: no value of type `never` can be passed to get here. */
    },
  });
