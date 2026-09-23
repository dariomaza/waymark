import { describe, expect, it } from "vitest";

import { mcpSettings } from "./mcp-settings.js";

/**
 * # The pair, in the shape the thing that consumes it already reads
 *
 * `apps/mcp` reads exactly two environment variables — `WAYMARK_API_URL` and
 * `WAYMARK_MACHINE_TOKEN` — and a person who has just been handed a secret is
 * about to go and type both of them somewhere. Retyping a 47-character
 * credential by eye is the failure this whole panel exists to avoid, and
 * retyping a hostname is how a working token ends up pointed at nothing.
 *
 * So the pair is rendered once, as two assignments, in the order somebody
 * reads them. It is a pure function of two strings, which is why it is here
 * and not inside a component.
 */
describe("the two settings a program needs", () => {
  it("is the address and the credential, one assignment each", () => {
    expect(mcpSettings("https://waymark.example", "wmk_secret")).toBe(
      "WAYMARK_API_URL=https://waymark.example\nWAYMARK_MACHINE_TOKEN=wmk_secret",
    );
  });

  /**
   * Two lines and nothing else. No quotes, no `export`, no comment: this is
   * pasted into an MCP client's `env` object as often as into a shell, and
   * anything decorative here has to be deleted by hand there.
   */
  it("is two lines, with nothing around them to delete", () => {
    const written = mcpSettings("http://127.0.0.1:3000", "wmk_x");

    expect(written.split("\n")).toHaveLength(2);
    expect(written.startsWith("WAYMARK_API_URL=")).toBe(true);
    expect(written.trim()).toBe(written);
  });
});
