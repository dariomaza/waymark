import type { PhotoId } from "../shared/identity.js";

/**
 * The port ADR 4 is about: background removal, running out of process.
 *
 * It is DECLARED and not implemented. Declaring it now is what keeps the photo
 * model honest — `processingStatus`, `processedPath` and the fallback in
 * `displayPathOf` only make sense if something is eventually going to fill them
 * in, and a reader should be able to see what that something looks like.
 *
 * Nothing in the API composes an implementation yet, and nothing depends on one
 * existing: a photo is complete and servable the moment its original is
 * written, which is precisely the property ADR 4 exists to protect. The rembg
 * sidecar is its own work unit.
 */
export interface ImageProcessor {
  /**
   * Removes the background of an already-stored photo and answers where the
   * result was written, or `null` when the processor is switched off or
   * declined the job. Throwing means "try again later"; `null` means "do not".
   */
  removeBackground(id: PhotoId, originalPath: string): Promise<string | null>;
}
