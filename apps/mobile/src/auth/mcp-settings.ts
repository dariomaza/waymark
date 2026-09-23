/**
 * The two environment variables `apps/mcp` reads, already assembled.
 *
 * ## Why this shape and not a config file
 *
 * A whole `mcpServers` block would have been the presumptuous version. It
 * needs absolute paths into a checkout on a machine this phone has never
 * seen — `/absolute/path/to/waymark/apps/mcp/...` in the README — and those
 * paths differ per MCP client and per person. A config file with one wrong
 * path in it is worse than no config file, because it reads as authoritative
 * and then fails somewhere that has nothing to do with Waymark.
 *
 * Two assignments are the most this app can assemble and still be certain
 * that every character of it is true: the address is the one this app is
 * talking to, and the credential is the one the API just issued.
 *
 * ## Why the names are written down again rather than shared
 *
 * `apps/web` carries the same two lines, and that is deliberate rather than
 * an oversight. These are not this app's own vocabulary to reuse — they are
 * documentation of a THIRD program's interface, the same way the README's
 * block is, and the file that tells the truth about them is
 * `apps/mcp/src/configuration.ts`. Two clients quoting one external contract
 * is the same shape as the two view files that quote the API's, which this
 * repository already spells out by hand on both sides.
 *
 * `apps/mcp` must not become a dependency of a phone: it is a Node process on
 * somebody else's machine, and importing it would drag the MCP SDK into an
 * Android bundle to read two strings.
 */
export const mcpSettings = (endpoint: string, secret: string): string =>
  `WAYMARK_API_URL=${endpoint}\nWAYMARK_MACHINE_TOKEN=${secret}`;
