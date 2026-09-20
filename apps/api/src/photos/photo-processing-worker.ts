import {
  markPhotoFailed,
  markPhotoProcessed,
  markPhotoSkipped,
  PhotoProcessingStatus,
  type Clock,
  type ImageProcessor,
  type Photo,
  type PhotoRepository,
} from "@ariadna/domain";

import { PermanentProcessingFailure } from "./photo-processing-failures.js";
import type { ClaimedPhoto, PhotoProcessingQueue } from "./photo-processing-queue.js";

/**
 * # The thing that actually gets photos processed
 *
 * A loop, in the API process, over the photos that are still `PENDING`. Not a
 * worker container, not a broker, not a cron job — see `photo-processing-queue.ts`
 * for why the photo table is the queue. What is left for this module is the
 * three decisions that make an asynchronous side feature safe to run next to
 * the thing it must never break:
 *
 * ## 1. How much may be in flight
 *
 * `concurrency` photos, and never more. `runOnce` claims a batch, waits for the
 * whole batch, and only then claims the next one. rembg is CPU bound and this
 * is one small box: an unbounded fan-out over a backlog of two hundred photos
 * is how a machine that was merely slow becomes a machine that is down, taking
 * the inventory — the PRIMARY feature — with it. The default is one, because
 * onnxruntime already uses every core for a single image.
 *
 * ## 2. When to try again
 *
 * Exponential backoff from `RETRY_BACKOFF_BASE_MS`, doubling, capped. A sidecar
 * that is down is down for minutes, not milliseconds, and retrying it every
 * poll would be a busy loop that also keeps the log unreadable.
 *
 * ## 3. When to stop trying
 *
 * `maxAttempts`, counted at CLAIM time so a process that dies mid-removal has
 * still spent one. After that the photo is `FAILED` and the reason is kept —
 * never retried silently for ever, and never dropped silently either, because
 * `POST /photos/:id/reprocess` is what turns "fixed the sidecar" into "try
 * these again".
 *
 * A `PermanentProcessingFailure` skips straight to the end of that: the sidecar
 * read these bytes and refused them, and it will refuse them identically for
 * ever.
 *
 * ## What this module is NOT allowed to do
 *
 * Fail an upload. Nothing here runs on the request path: an upload writes its
 * files, saves its row as `PENDING` and answers 201 whether this loop is
 * running, wedged, or was never started because no sidecar is configured.
 */

/**
 * One minute before the first retry.
 *
 * The transient failures are a sidecar restarting, an image being pulled, a
 * box rebooting — all of them minutes. Retrying after a second would be a busy
 * loop against a service that cannot answer yet, and would fill the log with
 * the same line a hundred times before anything changed.
 */
export const RETRY_BACKOFF_BASE_MS = 60_000;

/**
 * And never more than half an hour between attempts.
 *
 * Without a cap, doubling reaches days, and a photo whose sidecar came back an
 * hour ago would sit there anyway. Half an hour keeps the last attempts cheap
 * and still bounded.
 */
export const RETRY_BACKOFF_CAP_MS = 30 * 60_000;

/** 1 → 1 minute, 2 → 2, 3 → 4, 4 → 8, then the cap. */
export const backoffFor = (attempt: number): number =>
  Math.min(RETRY_BACKOFF_BASE_MS * 2 ** Math.max(attempt - 1, 0), RETRY_BACKOFF_CAP_MS);

export interface RunSummary {
  readonly claimed: number;
  readonly processed: number;
  readonly skipped: number;
  readonly retried: number;
  readonly abandoned: number;
}

/** The shape of Fastify's logger, so the app's can simply be handed over. */
export interface WorkerLogger {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

export interface PhotoProcessingWorkerDependencies {
  readonly photos: PhotoRepository;
  readonly queue: PhotoProcessingQueue;
  readonly processor: ImageProcessor;
  readonly clock: Clock;
  /** How many photos may be at the sidecar at once. */
  readonly concurrency: number;
  /** How many attempts a photo gets before it is left alone. */
  readonly maxAttempts: number;
  /** How often to look for work nobody woke us for. */
  readonly pollIntervalMs: number;
  /**
   * How long a claim holds if this process never comes back. Longer than the
   * sidecar timeout, or a photo still being processed would be handed to
   * somebody else while the first attempt is still running.
   */
  readonly leaseMs: number;
  readonly logger?: WorkerLogger;
}

type Outcome = "processed" | "skipped" | "retried" | "abandoned" | "vanished";

const SILENT: WorkerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const NOTHING: RunSummary = {
  claimed: 0,
  processed: 0,
  skipped: 0,
  retried: 0,
  abandoned: 0,
};

export class PhotoProcessingWorker {
  readonly #deps: PhotoProcessingWorkerDependencies;
  readonly #log: WorkerLogger;
  #running = false;
  #timer: NodeJS.Timeout | null = null;

  constructor(deps: PhotoProcessingWorkerDependencies) {
    this.#deps = deps;
    this.#log = deps.logger ?? SILENT;
  }

  /**
   * Drains everything claimable, `concurrency` photos at a time, and answers
   * what happened.
   *
   * It is the whole worker: `start` only calls this on a timer. Keeping the
   * loop callable and awaitable is what lets a test drive it one batch at a
   * time instead of racing a scheduler.
   *
   * Overlapping runs answer immediately rather than queueing. Two runs would be
   * two batches in flight, which is exactly the bound this exists to enforce —
   * and the lease means the second one would find nothing anyway.
   */
  async runOnce(): Promise<RunSummary> {
    if (this.#running) {
      return NOTHING;
    }

    this.#running = true;
    try {
      const totals = { ...NOTHING } as {
        claimed: number;
        processed: number;
        skipped: number;
        retried: number;
        abandoned: number;
      };

      for (;;) {
        const claimed = await this.#deps.queue.claim({
          now: this.#deps.clock.now(),
          limit: this.#deps.concurrency,
          leaseMs: this.#deps.leaseMs,
        });

        if (claimed.length === 0) {
          return totals;
        }

        totals.claimed += claimed.length;

        // The bound: the next batch is not claimed until this one is finished.
        const outcomes = await Promise.all(
          claimed.map(async (photo) => this.#process(photo)),
        );

        for (const outcome of outcomes) {
          if (outcome !== "vanished") {
            totals[outcome] += 1;
          }
        }
      }
    } finally {
      this.#running = false;
    }
  }

  /**
   * Starts the poll loop.
   *
   * `unref` on purpose: a background nicety must not be the reason a process
   * refuses to exit.
   */
  start(): void {
    if (this.#timer !== null) {
      return;
    }

    this.#timer = setInterval(() => this.wake(), this.#deps.pollIntervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * "There may be work now." Called after an upload, so a photo is processed in
   * seconds rather than at the next poll.
   *
   * A wake that arrives while a run is in progress is dropped rather than
   * queued, and that is safe: the running drain loop re-claims until nothing is
   * left, so it will see the new photo itself. If it somehow does not, the poll
   * timer is the floor.
   */
  wake(): void {
    void this.runOnce().catch((error: unknown) => {
      // Never let a background loop take the process with it.
      this.#log.error({ err: error }, "the photo processing worker threw");
    });
  }

  async #process(claimed: ClaimedPhoto): Promise<Outcome> {
    const photo = await this.#deps.photos.findById(claimed.photoId);
    if (photo === null || photo.processingStatus !== PhotoProcessingStatus.PENDING) {
      // Deleted, or finished by somebody else between the claim and the read.
      await this.#deps.queue.forget(claimed.photoId);
      return "vanished";
    }

    try {
      const processedPath = await this.#deps.processor.removeBackground(
        photo.id,
        photo.originalPath,
      );

      if (processedPath === null) {
        // The port's `null`: looked at, nothing to do, do not ask again.
        await this.#deps.photos.save(markPhotoSkipped(photo));
        await this.#deps.queue.forget(photo.id);
        return "skipped";
      }

      await this.#deps.photos.save(markPhotoProcessed(photo, processedPath));
      await this.#deps.queue.forget(photo.id);
      this.#log.info({ photoId: photo.id, processedPath }, "removed a photo background");

      return "processed";
    } catch (error) {
      return this.#failed(photo, claimed.attempt, error);
    }
  }

  async #failed(photo: Photo, attempt: number, error: unknown): Promise<Outcome> {
    const now = this.#deps.clock.now();
    const reason = describe(error);
    const permanent = error instanceof PermanentProcessingFailure;
    const exhausted = attempt >= this.#deps.maxAttempts;

    if (permanent || exhausted) {
      // FAILED is a terminal state with a way out: `POST /photos/:id/reprocess`.
      // Nothing is retried behind the operator's back from here.
      await this.#deps.photos.save(markPhotoFailed(photo));
      await this.#deps.queue.abandon({
        photoId: photo.id,
        reason: permanent
          ? reason
          : `${reason} (gave up after ${attempt} attempts)`,
        now,
      });
      this.#log.warn(
        { photoId: photo.id, attempt, permanent, reason },
        "gave up removing a photo background",
      );

      return "abandoned";
    }

    const at = new Date(now.getTime() + backoffFor(attempt));
    await this.#deps.queue.retryLater({ photoId: photo.id, at, reason, now });
    this.#log.warn(
      { photoId: photo.id, attempt, reason, nextAttemptAt: at.toISOString() },
      "background removal failed, will try again",
    );

    return "retried";
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
