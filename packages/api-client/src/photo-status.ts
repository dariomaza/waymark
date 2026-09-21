import { PhotoProcessingStatus } from "@ariadna/domain";

/**
 * What a photo's processing state is worth saying out loud, and what is not.
 *
 * Background removal is optional, runs out of process, and may never be
 * installed at all (ADR 4). `DONE` and `SKIPPED` are therefore not news: the
 * picture on the screen is the finished article either way, and a green tick
 * on every photo in a grid of ten is noise.
 *
 * The two that ARE news are the ones where the picture may still change, or
 * where it was supposed to and did not. Neither is a problem the person has
 * to act on — the original is on the screen and stays there — so this is a
 * sentence, and where it needs one the button beside it is the screen's to
 * add rather than this function's: `FAILED` gets the retry that ADR 4 asked
 * for (`POST /photos/:id/reprocess`), and `PENDING` gets nothing, because
 * offering to retry a photo nothing has tried yet would invent a problem.
 */
export const photoStatusNote = (status: PhotoProcessingStatus): string | null => {
  switch (status) {
    case PhotoProcessingStatus.PENDING:
      return "Background removal is still pending. The original is shown, and it stays shown whether or not the background is ever removed.";
    case PhotoProcessingStatus.FAILED:
      return "Background removal failed for this photo. The original is shown instead.";
    default:
      return null;
  }
};
