import type { ImageProcessor } from "@waymark/domain";

import type { PhotoProcessingQueue } from "./photo-processing-queue.js";
import type { PhotoProcessingWorker } from "./photo-processing-worker.js";

/**
 * # What the HTTP layer is allowed to know about background removal
 *
 * Three things, and deliberately not one more: the bookkeeping it can count and
 * reset, whether the feature is switched on and answering, and a way to say
 * "there may be work now".
 *
 * The routes never hold the worker itself. A handler that could call
 * `runOnce()` would be a handler that can be made to wait for a background
 * removal, and the whole of ADR 4 is that a request must never be able to.
 */

export interface ImageProcessorStatus {
  /** Whether a sidecar is configured at all. */
  readonly enabled: boolean;
  /** Where it is, so a wrong address is visible without reading the compose file. */
  readonly url: string | null;
  /** `null` when there is nothing to reach, rather than a misleading `false`. */
  readonly reachable: boolean | null;
}

/** An `ImageProcessor` that can also say where it is and whether it answers. */
export interface ReachableImageProcessor extends ImageProcessor {
  readonly baseUrl: string;
  isReachable(): Promise<boolean>;
}

export interface PhotoProcessingDependencies {
  readonly queue: PhotoProcessingQueue;
  status(): Promise<ImageProcessorStatus>;
  /**
   * "There may be work now." Fire and forget: it starts nothing the caller
   * waits on, and it is a no-op when no sidecar is configured.
   */
  wake(): void;
}

export const SWITCHED_OFF: ImageProcessorStatus = {
  enabled: false,
  url: null,
  reachable: null,
};

export interface PhotoProcessingInput {
  readonly queue: PhotoProcessingQueue;
  /**
   * Looked up per call rather than captured, and `null` when
   * `WAYMARK_IMAGE_PROCESSOR_URL` is unset. Holding the instance would make
   * this surface report a processor that has since been replaced, which is
   * exactly what an operator reading `/photos/processing` must not be told.
   */
  processor(): ReachableImageProcessor | null;
  worker(): PhotoProcessingWorker | null;
}

/**
 * Wires the queue, the processor and the worker into the three-method surface
 * the routes see.
 *
 * Reachability is probed on demand rather than cached. `/photos/processing` is
 * an authenticated page somebody opens when they suspect something is wrong,
 * and a cached answer is precisely the one that would tell them the sidecar is
 * fine thirty seconds after it stopped being fine.
 */
export const createPhotoProcessing = (
  input: PhotoProcessingInput,
): PhotoProcessingDependencies => ({
  queue: input.queue,

  async status(): Promise<ImageProcessorStatus> {
    const processor = input.processor();
    if (processor === null) {
      return SWITCHED_OFF;
    }

    return {
      enabled: true,
      url: processor.baseUrl,
      reachable: await processor.isReachable(),
    };
  },

  wake(): void {
    input.worker()?.wake();
  },
});
