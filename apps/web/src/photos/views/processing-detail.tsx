import type { PhotoProcessingResponse } from "@waymark/api-client";
import { PhotoProcessingStatus } from "@waymark/domain";
import type { Translate } from "@waymark/i18n";
import type { JSX, ReactNode } from "react";

import { Callout } from "../../ui/atoms/callout.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";

import "./processing-detail.css";
import { useTranslate } from "../../app/language-context.js";

export interface ProcessingDetailProps {
  readonly processing: PhotoProcessingResponse;
  /** The bulk retry, when there is anything to retry. Injected. */
  readonly bulkRetry?: ReactNode;
  /** Rendered on each abandoned row; the retry for that one photo. */
  readonly rowAction?: (photoId: string) => ReactNode;
}

/**
 * # What background removal is doing
 *
 * Purely presentational: it says what the API answered and draws the buttons
 * it was handed. It has no idea that a retry can fail, which is why the
 * container above can grow that without touching this.
 *
 * The first sentence is the one that matters, and it has three forms rather
 * than two. "Switched off" is not a fault: with no sidecar configured there
 * is no processor, no worker and no timer, every photo sits at `PENDING` for
 * ever, and that is a complete installation (ADR 4). Saying "unreachable"
 * there would report a problem nobody has.
 */
export const ProcessingDetail = ({
  processing,
  bulkRetry,
  rowAction,
}: ProcessingDetailProps): JSX.Element => {
  const t = useTranslate();

  const { processor, counts, abandoned } = processing;
  const failed = counts[PhotoProcessingStatus.FAILED];

  return (
    <>
      <Callout tone={processor.reachable === false ? "blocked" : "note"}>
        {processor.enabled
          ? processor.reachable === false
            ? t("photos.processorUnreachable")
            : t("photos.processorOn")
          : t("photos.processorOff")}
        {processor.url === null ? null : (
          <>
            {" "}
            <span className="processing__url">{processor.url}</span>
          </>
        )}
      </Callout>

      <section>
        <h3>{t("photos.states")}</h3>
        <dl className="processing__counts" aria-label={t("photos.states")}>
          {Object.values(PhotoProcessingStatus).map((status) => (
            <div className="processing__count" key={status}>
              <dt>{stateLabels(t)[status]}</dt>
              <dd>{counts[status]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>{t("photos.givenUpOn")}</h3>
        {failed === 0 ? (
          <EmptyNote>{t("photos.nothingFailed")}</EmptyNote>
        ) : (
          <>
            <p className="processing__failed-count">
              {t("photos.failedCount", { count: failed })}
            </p>
            {bulkRetry}
          </>
        )}

        {abandoned.length === 0 ? null : (
          <ul className="processing__abandoned" aria-label={t("photos.givenUpOn")}>
            {abandoned.map((entry) => (
              <li className="processing__row" key={entry.photoId}>
                <p className="processing__photo-id">{entry.photoId}</p>
                <p className="processing__reason">{entry.lastError}</p>
                <p className="processing__spent">
                  {t("photos.attempts", { count: entry.attempts })}
                  {t("photos.lastOn", {
                    when: new Date(entry.lastAttemptAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " "),
                  })}
                </p>
                {rowAction?.(entry.photoId)}
              </li>
            ))}
          </ul>
        )}

        {abandoned.length > 0 && abandoned.length < failed ? (
          <p className="processing__sample">
            {t("photos.showingSome", { count: abandoned.length })}
          </p>
        ) : null}
      </section>
    </>
  );
};

/**
 * Said the way somebody standing outside this feature would say it.
 *
 * A function of the translator rather than the constant it used to be: the
 * words are not knowable until a language is, and a table built once at
 * import time would be built in whichever language loaded first.
 */
const stateLabels = (t: Translate): Readonly<Record<PhotoProcessingStatus, string>> => ({
  [PhotoProcessingStatus.PENDING]: t("photos.waiting"),
  [PhotoProcessingStatus.DONE]: t("photos.removed"),
  [PhotoProcessingStatus.FAILED]: t("photos.givenUpOn"),
  [PhotoProcessingStatus.SKIPPED]: t("photos.nothingToRemove"),
});
