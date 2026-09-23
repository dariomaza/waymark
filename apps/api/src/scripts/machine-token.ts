import { SystemClock } from "../adapters/system-clock.js";
import { UuidIdGenerator } from "../adapters/uuid-id-generator.js";
import {
  InvalidMachineTokenName,
  MachineTokenNameAlreadyTaken,
} from "../auth/auth-errors.js";
import { CreateMachineToken } from "../auth/create-machine-token.js";
import type { MachineToken } from "../auth/machine-token.js";
import { RevokeMachineToken } from "../auth/revoke-machine-token.js";
import { loadConfig } from "../config.js";
import { createPrismaClient } from "../persistence/prisma-client.js";
import { PrismaMachineTokenRepository } from "../persistence/prisma-machine-token-repository.js";
import {
  USAGE,
  parseMachineTokenCommand,
  type MachineTokenCommand,
} from "./machine-token-command.js";

/**
 * `pnpm --filter @waymark/api machine-token <create|revoke|list>`
 *
 * The only way a machine token comes into existence, and the only way one goes
 * away. There is no route for either, for the reason `create-user.ts` gives
 * about accounts and more so: an endpoint that mints a LONG-LIVED credential on
 * an internet-facing inventory is a door that does not close by itself.
 *
 * ## Why the secret is printed rather than written anywhere
 *
 * It is shown once, on standard output, and then it is gone — the server keeps
 * only a SHA-256 of it. Writing it to a file would leave a credential on disk
 * with whatever permissions the shell felt like; printing it puts the decision
 * about where it ends up in the hands of the person who asked for it, which is
 * the same person who is about to paste it into a compose file.
 *
 * `create-user` refuses `--password` because a password typed as an argument
 * lands in shell history and in `ps`. The mirror image applies here and there
 * is nothing to refuse: the secret is generated in this process, so there is no
 * argument for it to be passed as. A `--token` is rejected by the parser anyway,
 * because somebody reaching for it has misunderstood what this command does.
 */

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const formatMoment = (moment: Date | null): string =>
  moment === null ? "-" : moment.toISOString();

/**
 * A fixed-width table rather than JSON.
 *
 * The audience is a person on an SSH session deciding whether a credential is
 * still in use, and `lastUsedAt` is the column they came for: a token nobody
 * can see being used is one nobody will ever think to revoke.
 */
const printTokens = (tokens: readonly MachineToken[]): void => {
  if (tokens.length === 0) {
    process.stdout.write("No machine tokens.\n");
    return;
  }

  const rows = tokens.map((token) => [
    token.name,
    token.scope,
    formatMoment(token.createdAt),
    formatMoment(token.expiresAt),
    formatMoment(token.lastUsedAt),
  ]);
  const header = ["NAME", "SCOPE", "CREATED", "EXPIRES", "LAST USED"];
  const widths = header.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => (row[index] ?? "").length)),
  );

  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join("  ")
      .trimEnd();

  process.stdout.write(`${line(header)}\n`);
  for (const row of rows) {
    process.stdout.write(`${line(row)}\n`);
  }
};

const run = async (command: MachineTokenCommand): Promise<void> => {
  const config = loadConfig(process.env);
  const prisma = createPrismaClient(config.databaseUrl);
  const machineTokens = new PrismaMachineTokenRepository(prisma);

  try {
    switch (command.kind) {
      case "create": {
        const { token, machineToken } = await new CreateMachineToken({
          machineTokens,
          ids: new UuidIdGenerator(),
          clock: new SystemClock(),
        }).execute({
          name: command.name,
          scope: command.scope,
          ...(command.expiresInDays === null
            ? {}
            : { expiresInDays: command.expiresInDays }),
        });

        process.stdout.write(
          `Created machine token "${machineToken.name}" (${machineToken.scope}).\n\n` +
            `  ${token}\n\n` +
            "This is the only time it will ever be shown. Store it now.\n" +
            "Present it as:  Authorization: Machine <token>\n",
        );
        return;
      }

      case "revoke": {
        const revoked = await new RevokeMachineToken({ machineTokens }).execute(
          command.name,
        );

        if (!revoked) {
          // Not silent success. Somebody revoking a credential is acting on a
          // decision, and "done" in answer to a misspelled name would let them
          // walk away believing a live token was dead.
          return void fail(`There is no machine token named "${command.name}".`);
        }

        process.stdout.write(
          `Revoked "${command.name}". It stops working on the next request.\n`,
        );
        return;
      }

      case "list":
        printTokens(await machineTokens.list());
        return;

      default:
        return;
    }
  } catch (error) {
    if (
      error instanceof MachineTokenNameAlreadyTaken ||
      error instanceof InvalidMachineTokenName
    ) {
      return void fail(error.message);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

const main = async (): Promise<void> => {
  const command = parseMachineTokenCommand(process.argv.slice(2));

  if (command.kind === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  if (command.kind === "error") {
    return void fail(command.message);
  }

  await run(command);
};

await main();
