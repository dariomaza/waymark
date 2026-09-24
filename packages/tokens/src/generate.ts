import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cssText } from "./css.js";

/**
 * Writes the browser's stylesheet from the shared source.
 *
 * `pnpm --filter @waymark/tokens generate`, and the only time it is needed is
 * after changing a value in this package. The test in the web client says so
 * by name when it fails, so nobody has to remember this file exists.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

const TARGET = join(HERE, "../../../apps/web/src/ui/styles/tokens.css");

writeFileSync(TARGET, cssText(), "utf8");

process.stdout.write(`wrote ${TARGET}\n`);
