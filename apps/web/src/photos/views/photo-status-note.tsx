import { type PhotoView } from "@ariadna/api-client";
import { photoStatusNote } from "@ariadna/i18n";
import { PhotoProcessingStatus } from "@ariadna/domain";
import type { JSX } from "react";
import { Link } from "react-router-dom";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { ROUTES } from "../../app/routes.js";
import { useTranslate } from "../../app/language-context.js";

export interface PhotoStatusNoteProps {
  readonly photo: PhotoView;
  /** Puts this photo back in the queue. See `useReprocessPhoto`. */
  readonly onRetry: () => void;
  readonly retrying: boolean;
}

/**
 * # What a photo's processing state is worth saying, and what to do about it
 *
 * The sentence is shared with the Android app (`photoStatusNote`), because
 * `DONE` and `SKIPPED` are not news on either — the picture on the screen is
 * the finished article either way, and a tick on every photo in a grid of ten
 * is noise. The two that are news are the ones where the picture may still
 * change, or where it was supposed to and did not.
 *
 * `FAILED` is the only one with a button. `PENDING` is the normal state of a
 * freshly uploaded photo and may be its final one, since background removal
 * is optional and may not be installed at all (ADR 4) — offering to "retry" a
 * photo nothing has tried yet would invent a problem.
 *
 * It is a NOTE and not an alert, and the button is its action rather than the
 * screen's: the original photo is on the screen and stays there whatever
 * happens next. And the link out is the answer to the question a failure
 * immediately raises — "is it just this one?" — which is the screen the two
 * `/photos/processing` routes were built for.
 */
export const PhotoStatusNote = ({
  photo,
  onRetry,
  retrying,
}: PhotoStatusNoteProps): JSX.Element | null => {
  const t = useTranslate();

  const note = t(photoStatusNote(photo.processingStatus));
  if (note === null) {
    return null;
  }

  const failed = photo.processingStatus === PhotoProcessingStatus.FAILED;

  return (
    <Callout
      tone="note"
      {...(failed
        ? {
            action: (
              <>
                <Button
                  disabled={retrying}
                  onClick={() => {
                    onRetry();
                  }}
                >
                  {t("photos.retryRemoval")}
                </Button>
                <Link className="button button--quiet" to={ROUTES.backgroundRemoval}>
                  {t("photos.seeFailed")}
                </Link>
              </>
            ),
          }
        : {})}
    >
      {note}
    </Callout>
  );
};
