import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { SystemClock } from "../adapters/system-clock.js";
import { UuidIdGenerator } from "../adapters/uuid-id-generator.js";
import { UsernameAlreadyTaken } from "../auth/auth-errors.js";
import { CreateUser } from "../auth/create-user.js";
import { ScryptPasswordHasher } from "../auth/password-hasher.js";
import { normalizeUsername } from "../auth/user.js";
import { loadConfig } from "../config.js";
import { createPrismaClient } from "../persistence/prisma-client.js";
import { PrismaUserRepository } from "../persistence/prisma-user-repository.js";

/**
 * `pnpm --filter @waymark/api create-user`
 *
 * The only way an account comes into existence. There is no registration
 * endpoint: the API is on the public internet through a Cloudflare Tunnel, and
 * a sign-up form on a household inventory is a door, not a feature.
 *
 * ## Why the password is never an argument
 *
 * `create-user --username dario --password hunter2` writes the password into
 * `~/.zsh_history`, into the output of `ps`, and into any shell audit log on
 * the box. So `--password` is not merely undocumented here, it is REJECTED with
 * an explanation, because an option that silently does the unsafe thing is
 * worse than one that does not exist.
 *
 * In order of preference:
 *
 * 1. Interactive: the password is prompted for twice with the terminal echo
 *    switched off, and never appears on screen.
 * 2. Piped: `printf '%s' "$PASSWORD" | pnpm --filter @waymark/api create-user
 *    --username dario`, for a provisioning script. The password travels through
 *    a pipe, which no history file and no process list ever sees.
 * 3. `WAYMARK_PASSWORD` in the environment. Convenient for automation and the
 *    weakest of the three: environment variables are readable by other
 *    processes of the same user and leak into crash dumps.
 */

const MINIMUM_PASSWORD_LENGTH = 12;

const usage = `
Usage: pnpm --filter @waymark/api create-user [--username <name>]

The password is NEVER taken as an argument. It is read, in this order, from:
  1. standard input, when it is piped
  2. the WAYMARK_PASSWORD environment variable
  3. an interactive prompt with echo switched off
`.trim();

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const readPipedPassword = async (): Promise<string | null> => {
  if (process.stdin.isTTY === true) {
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk as Buffer));
  }

  const piped = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/u, "");

  return piped.length === 0 ? null : piped;
};

/**
 * Reads a line without echoing it.
 *
 * `readline` writes every keystroke back to the terminal through
 * `_writeToOutput`. Replacing it AFTER `question` has already printed the
 * prompt shows the prompt and swallows everything typed in response.
 */
const askSecretly = async (prompt: string): Promise<string> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(prompt, resolve);
    (rl as unknown as { _writeToOutput: (chunk: string) => void })._writeToOutput =
      (): void => {};
  });

  rl.close();
  process.stdout.write("\n");

  return answer;
};

const ask = async (prompt: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(prompt, resolve);
  });
  rl.close();

  return answer;
};

const main = async (): Promise<void> => {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        username: { type: "string" },
        password: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    });
  } catch {
    return void fail(usage);
  }

  if (parsed.values.help === true) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  if (parsed.values.password !== undefined) {
    return void fail(
      "--password is refused on purpose: it would land in your shell history " +
        `and in the process list.\n\n${usage}`,
    );
  }

  const piped = await readPipedPassword();

  const username = normalizeUsername(
    parsed.values.username ?? (piped === null ? await ask("Username: ") : ""),
  );
  if (username.length === 0) {
    return void fail(`A username is required.\n\n${usage}`);
  }

  const password =
    piped ??
    process.env["WAYMARK_PASSWORD"] ??
    (await promptForNewPassword());

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return void fail(
      `The password must be at least ${MINIMUM_PASSWORD_LENGTH} characters. ` +
        "This account can read and edit the whole inventory from the public internet.",
    );
  }

  const config = loadConfig(process.env);
  const prisma = createPrismaClient(config.databaseUrl);

  try {
    const user = await new CreateUser({
      users: new PrismaUserRepository(prisma),
      hasher: new ScryptPasswordHasher(),
      ids: new UuidIdGenerator(),
      clock: new SystemClock(),
    }).execute({ username, password });

    process.stdout.write(`Created user "${user.username}" (${user.id}).\n`);
  } catch (error) {
    if (error instanceof UsernameAlreadyTaken) {
      return void fail(error.message);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

const promptForNewPassword = async (): Promise<string> => {
  const password = await askSecretly("Password: ");
  const again = await askSecretly("Password again: ");

  if (password !== again) {
    return fail("The two passwords do not match.");
  }

  return password;
};

await main();
