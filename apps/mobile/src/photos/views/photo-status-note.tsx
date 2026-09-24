import { type PhotoView } from "@waymark/api-client";
import { photoStatusNote } from "@waymark/i18n";
import { PhotoProcessingStatus } from "@waymark/domain";
import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { QuietLink } from "../../ui/atoms/quiet-link.js";
import { useTranslate } from "../../app/language-context.js";

export interface PhotoStatusNoteProps {
  readonly photo: PhotoView;
  /** Puts this photo back in the queue. See `useReprocessPhoto`. */
  readonly onRetry: () => void;
  readonly retrying: boolean;
  /**
   * The way to the queue screen, which answers the question a failure
   * immediately raises: is it just this one?
   *
   * Only ever drawn beside a `FAILED` photo, and injected rather than
   * navigated to here, because this file is a view.
   */
  readonly onSeeFailed?: (() => void) | undefined;
}

/**
 * What a photo's processing state is worth saying, and what to do about it.
 *
 * The sentence is shared with the web PWA (`photoStatusNote`), because `DONE`
 * and `SKIPPED` are not news on either: the picture on the screen is the
 * finished article whichever way it went, and a tick on every cell of a grid
 * of ten is noise.
 *
 * `FAILED` is the only one with a button. `PENDING` is the normal state of a
 * freshly uploaded photo and may be its final one, since background removal
 * is optional and may not be installed at all (ADR 4) — offering to retry
 * something nothing has tried yet would invent a problem.
 */
export const PhotoStatusNote = ({
  photo,
  onRetry,
  retrying,
  onSeeFailed,
}: PhotoStatusNoteProps): JSX.Element | null => {
  const t = useTranslate();

  const note = t(photoStatusNote(photo.processingStatus));
  if (note === null) {
    return null;
  }

  const failed = photo.processingStatus === PhotoProcessingStatus.FAILED;

  /*
   * A `Callout` in the `note` tone, which is what the browser has always drawn
   * here. This was a bare line of muted text, so the same sentence was an
   * aside on one client and a marked note on the other (ADR 22).
   *
   * It is a NOTE and not an alert: the original photograph is on the screen
   * and stays there whatever happens next.
   */
  return (
    <Callout
      tone="note"
      {...(failed
        ? {
            action: (
              <>
                <Button
                  tone="quiet"
                  label={t("photos.retryRemoval")}
                  disabled={retrying}
                  onPress={onRetry}
                >
                  {t("photos.retryRemoval")}
                </Button>
                {onSeeFailed === undefined ? null : (
                  /*
                   * The site ADR 21 named for `QuietLink` and then left alone.
                   * This is a way SOMEWHERE — the queue of everything that
                   * failed — beside a button that acts on the photograph in
                   * front of you, and drawing both as rectangles said they
                   * were the same kind of thing.
                   */
                  <QuietLink icon="image" onPress={onSeeFailed}>
                    {t("photos.seeFailed")}
                  </QuietLink>
                )}
              </>
            ),
          }
        : {})}
    >
      {note}
    </Callout>
  );
};
