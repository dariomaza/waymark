/**
 * # The two kinds of "it did not work"
 *
 * The `ImageProcessor` port already draws one line: throwing means "try again
 * later", `null` means "do not". This draws the line underneath the throw,
 * because "try again later" is the wrong answer for a photo that is going to be
 * refused every single time, and retrying THAT for ever is a busy loop with a
 * fixed answer at the end of it.
 *
 * They live in their own module rather than inside the rembg adapter so that
 * the worker — which decides whether to schedule another attempt — does not
 * have to import the name of a particular sidecar to ask a question about
 * failure. Another `ImageProcessor` adapter would raise the same two.
 */

/**
 * The processor is having a bad time. A restart, a redeploy or simply waiting
 * may fix it, so the photo is worth a bounded number of further attempts.
 */
export class TransientProcessingFailure extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransientProcessingFailure";
  }
}

/**
 * These bytes will never be processed: the decoder refused them, or the file
 * the row points at is not there. Waiting changes nothing, so the photo is
 * marked `FAILED` on the first occurrence and the reason is kept.
 */
export class PermanentProcessingFailure extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PermanentProcessingFailure";
  }
}
