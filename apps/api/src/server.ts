import { SystemClock } from "./adapters/system-clock.js";
import { PrismaSessionRepository } from "./persistence/prisma-session-repository.js";
import { composeApp } from "./composition-root.js";
import { loadConfig } from "./config.js";
import { buildApp } from "./http/build-app.js";
import { createPrismaClient } from "./persistence/prisma-client.js";
import type { WorkerLogger } from "./photos/photo-processing-worker.js";

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

/**
 * The worker logs through the app's logger, and the app needs the worker to
 * exist first (a route has to be able to wake it). Forwarding rather than
 * holding a reference is what unties that knot: nothing here is called until
 * both are built.
 */
const workerLog: WorkerLogger = {
  info: (details, message) => app.log.info(details, message),
  warn: (details, message) => app.log.warn(details, message),
  error: (details, message) => app.log.error(details, message),
};

const composed = composeApp(prisma, config, clock, workerLog);
const app = buildApp(composed.dependencies);

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
  composed.worker?.stop();
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

  /**
   * Started AFTER the port is open, and never awaited.
   *
   * Background removal is the secondary feature (ADR 4): if it were started
   * first, a sidecar that is slow to come up would delay the inventory being
   * reachable, which is precisely the dependency this design refuses. With no
   * sidecar configured there is no worker at all, and the log line says so
   * once, at boot, rather than leaving somebody wondering.
   */
  if (composed.worker === null) {
    app.log.info("background removal is switched off; photos stay PENDING");
  } else {
    composed.worker.start();
    composed.worker.wake();
    app.log.info(
      { sidecar: config.imageProcessing.url },
      "background removal worker started",
    );
  }
} catch (error) {
  app.log.error({ err: error }, "could not start");
  process.exit(1);
}
