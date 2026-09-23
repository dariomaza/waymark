/**
 * The two environment variables `apps/mcp` reads, already assembled.
 *
 * ## Why this shape and not a config file
 *
 * A whole `mcpServers` block would have been the presumptuous version. It
 * needs absolute paths into a checkout on a machine this browser has never
 * seen — `/absolute/path/to/waymark/apps/mcp/...` in the README — and those
 * paths differ per MCP client and per person. A config file with one wrong
 * path in it is worse than no config file, because it reads as authoritative
 * and then fails somewhere that has nothing to do with Waymark.
 *
 * Two assignments are the most this app can assemble and still be certain
 * that every character of it is true: the address is the one the browser is
 * talking to, and the credential is the one the API just issued.
 *
 * ## Why the names are written down here
 *
 * `apps/mcp` is not a dependency of this app and must not become one — it is
 * a Node process on somebody else's machine, and importing it would drag the
 * MCP SDK into a browser bundle to read two strings. These are documentation,
 * the same way the README's block is, and `mcp-settings.test.ts` is what
 * fails if `apps/mcp/src/configuration.ts` ever renames one.
 */
export const mcpSettings = (endpoint: string, secret: string): string =>
  `WAYMARK_API_URL=${endpoint}\nWAYMARK_MACHINE_TOKEN=${secret}`;
