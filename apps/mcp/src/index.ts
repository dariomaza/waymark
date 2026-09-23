/**
 * # Waymark's MCP server
 *
 * The third consumer of `@waymark/api-client`, after the PWA and the Android
 * app, and the one that is not a person. It exists so that an assistant
 * helping with a project can answer "which box is the soldering iron in"
 * without anybody getting up: the inventory is the memory, and this is how a
 * model reads it.
 *
 * It speaks MCP over stdio, it authenticates with a machine token (ADR 17),
 * and it contains no HTTP at all — every request it makes goes through the
 * same shared client the browser and the phone use, which is the only thing
 * that makes that package's abstraction a fact rather than a claim.
 */
export {
  API_URL_VARIABLE,
  DEFAULT_API_URL,
  MACHINE_TOKEN_VARIABLE,
  readConfiguration,
  type Configuration,
  type ConfigurationResult,
} from "./configuration.js";
