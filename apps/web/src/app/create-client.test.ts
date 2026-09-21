import { describe, expect, it } from "vitest";

import { apiBaseUrl } from "./create-client.js";

describe("where this app looks for the API", () => {
  it("looks at its own origin, so a deployed bundle carries no hostname", () => {
    // The API serves this bundle. The host to call it on is therefore the
    // host it was downloaded from, and the empty base is how a relative
    // request says that — which is what lets one image serve any tunnel
    // hostname without being rebuilt for it.
    expect(apiBaseUrl()).toBe("");
  });
});
