import { describeFailure } from "@ariadna/i18n";
import { photoId as toPhotoId } from "@ariadna/domain";
import type { JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { useReprocessPhoto, useRetryFailedPhotos } from "./photo-mutations.js";
import { usePhotoProcessing } from "./processing-queries.js";
import { ProcessingDetail } from "./views/processing-detail.js";
import { useTranslate } from "../app/language-context.js";

/**
 * # The screen for whoever runs the sidecar
 *
 * `GET /photos/processing` was built so that "is it on" and "how many are
 * stuck" do not need SSH and a SQL client (ADR 10), and `POST
 * /photos/:id/reprocess` and `POST /photos/processing/retry` were built so a
 * `FAILED` photo is not failed for ever (ADR 4). None of the three had a
 * button anywhere. This is the button.
 *
 * It is deliberately NOT in the bottom navigation. Background removal is a
 * secondary feature that must never take space from the primary one, and a
 * tab for it would be this app disagreeing with ADR 4 in the place people
 * look most. It is reached from where somebody has just met the problem: the
 * note under a photo whose removal failed.
 *
 * A container. It fetches, it owns the two mutations, and everything it draws
 * is one presentational component away.
 */
export const PhotoProcessingScreen = (): JSX.Element => {
  const t = useTranslate();

  const processing = usePhotoProcessing();
  const retryAll = useRetryFailedPhotos();
  const reprocess = useReprocessPhoto();

  return (
    <main className="screen">
      <h2>{t("photos.processingTitle")}</h2>

      {processing.isPending ? <Loading label={t("photos.processingLoading")} /> : null}

      {processing.isError ? (
        <FailureNote
          error={processing.error}
          onRetry={() => {
            void processing.refetch();
          }}
        />
      ) : null}

      {processing.isSuccess ? (
        <ProcessingDetail
          processing={processing.data}
          bulkRetry={
            <Button
              tone="primary"
              disabled={retryAll.isPending}
              onClick={() => {
                retryAll.mutate();
              }}
            >
              {t("photos.retryAll")}
            </Button>
          }
          rowAction={(photoId) => (
            <Button
              disabled={reprocess.isPending}
              onClick={() => {
                reprocess.mutate(toPhotoId(photoId));
              }}
            >
              Try {photoId} again
            </Button>
          )}
        />
      ) : null}

      {/*
        The answer is a 202: the photos are queued, and how long that takes is
        the sidecar's business. Saying "back in the queue" rather than "done"
        is the whole of ADR 4 in one sentence.
      */}
      {retryAll.isSuccess ? (
        <Callout tone="note">
          {retryAll.data.requeued === 1
            ? `1 photo is back in the queue.`
            : `${String(retryAll.data.requeued)} photos are back in the queue.`}
        </Callout>
      ) : null}

      {retryAll.isError ? (
        <Callout tone="wrong">{t(describeFailure(retryAll.error))}</Callout>
      ) : null}
      {reprocess.isError ? (
        <Callout tone="wrong">{t(describeFailure(reprocess.error))}</Callout>
      ) : null}
    </main>
  );
};
