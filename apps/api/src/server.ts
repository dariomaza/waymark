import { SystemClock } from "./adapters/system-clock.js";
import { PrismaSessionRepository } from "./persistence/prisma-session-repository.js";
import { createAppDependencies } from "./composition-root.js";
import { loadConfig } from "./config.js";
import { buildApp } from "./http/build-app.js";
import { createPrismaClient } from "./persistence/prisma-client.js";

/**
 * The process entrypoint. Reads the environment, wires the adapters, listens.
 *
 * Nothing here is reachable from a test: the moment this file has logic worth
 * testing, that logic belongs in `buildApp` or in `loadConfig`, both of which
 * are.
 */

/** Sessions that lapsed without anybody presenting them again. */
const EXPIRED_SESSION_SWEEP_MS = 60 * 60 * 1000;

const config = loadConfig(process.env);
const clock = new SystemClock();
const prisma = createPrismaClient(config.databaseUrl);
const app = buildApp(createAppDependencies(prisma, config, clock));

const sessions = new PrismaSessionRepository(prisma);

/**
 * `AuthenticateSession` already deletes an expired session the moment somebody
 * presents it. This sweep is for the ones nobody ever presents again — an
 * uninstalled app, a sold phone — which would otherwise sit in the table for
 * good.
 */
const sweepExpiredSessions = async (): Promise<void> => {
  try {
    const removed = await sessions.deleteExpired(clock.now());
    if (removed > 0) {
      app.log.info({ removed }, "swept expired sessions");
    }
  } catch (error) {
    app.log.error({ err: error }, "could not sweep expired sessions");
  }
};

const sweep = setInterval(() => void sweepExpiredSessions(), EXPIRED_SESSION_SWEEP_MS);
sweep.unref();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  clearInterval(sweep);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}

try {
  await sweepExpiredSessions();
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "could not start");
  process.exit(1);
}
