import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readConfiguration } from "./configuration.js";
import { createWaymarkMcpServer } from "./server.js";

/**
 * # The process
 *
 * Started by whatever MCP client is configured to run it, talking JSON-RPC
 * over its own stdin and stdout. That is the one thing to be careful about
 * here: **stdout is the transport**, so a stray `console.log` anywhere in this
 * package would be framed as a protocol message and would break the session
 * rather than print anything. Diagnostics go to stderr, which the client shows
 * in its log and which nothing parses.
 *
 * Unusable configuration does not stop it. The reason is in
 * `configuration.ts`: a process that exits is a server the client draws as
 * "failed", with the explanation in a file nobody has open, whereas a server
 * that starts and answers "there is no machine token, here is the command that
 * makes one" puts the fix in the conversation where somebody is already
 * standing in a garage asking where something is. It is written to stderr too,
 * for whoever does open the log.
 */
const configuration = readConfiguration(process.env);

if (!configuration.ok) {
  process.stderr.write(`waymark-mcp: ${configuration.problem}\n`);
}

const server = createWaymarkMcpServer(configuration);

await server.connect(new StdioServerTransport());
