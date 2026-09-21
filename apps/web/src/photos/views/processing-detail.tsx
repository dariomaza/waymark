import type { PhotoProcessingResponse } from "@ariadna/api-client";
import { PhotoProcessingStatus } from "@ariadna/domain";
import type { JSX, ReactNode } from "react";

import { Callout } from "../../ui/atoms/callout.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";

import "./processing-detail.css";

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
  const { processor, counts, abandoned } = processing;
  const failed = counts[PhotoProcessingStatus.FAILED];

  return (
    <>
      <Callout tone={processor.reachable === false ? "blocked" : "note"}>
        {processor.enabled
          ? processor.reachable === false
            ? `Background removal is configured but the sidecar is not answering. Photos stay as they were uploaded and are retried until it comes back.`
            : `Background removal is on and answering.`
          : `Background removal is switched off. Photos are stored and shown exactly as they were uploaded, and every one of them waits in case a sidecar appears later.`}
        {processor.url === null ? null : (
          <>
            {" "}
            <span className="processing__url">{processor.url}</span>
          </>
        )}
      </Callout>

      <section>
        <h3>Photos in each state</h3>
        <dl className="processing__counts" aria-label="Photos in each state">
          {Object.values(PhotoProcessingStatus).map((status) => (
            <div className="processing__count" key={status}>
              <dt>{STATE_LABELS[status]}</dt>
              <dd>{counts[status]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>Given up on</h3>
        {failed === 0 ? (
          <EmptyNote>Nothing has failed.</EmptyNote>
        ) : (
          <>
            <p className="processing__failed-count">
              {failed === 1
                ? `1 photo was given up on.`
                : `${String(failed)} photos were given up on.`}
            </p>
            {bulkRetry}
          </>
        )}

        {abandoned.length === 0 ? null : (
          <ul className="processing__abandoned" aria-label="Given up on">
            {abandoned.map((entry) => (
              <li className="processing__row" key={entry.photoId}>
                <p className="processing__photo-id">{entry.photoId}</p>
                <p className="processing__reason">{entry.lastError}</p>
                <p className="processing__spent">
                  {entry.attempts === 1 ? `1 attempt` : `${String(entry.attempts)} attempts`}
                  {", last on "}
                  {new Date(entry.lastAttemptAt).toISOString().slice(0, 16).replace("T", " ")}
                </p>
                {rowAction?.(entry.photoId)}
              </li>
            ))}
          </ul>
        )}

        {abandoned.length > 0 && abandoned.length < failed ? (
          <p className="processing__sample">
            Showing {abandoned.length} of them. The count above is the whole truth.
          </p>
        ) : null}
      </section>
    </>
  );
};

/** Said the way somebody standing outside this feature would say it. */
const STATE_LABELS: Readonly<Record<PhotoProcessingStatus, string>> = {
  [PhotoProcessingStatus.PENDING]: "Waiting",
  [PhotoProcessingStatus.DONE]: "Background removed",
  [PhotoProcessingStatus.FAILED]: "Given up on",
  [PhotoProcessingStatus.SKIPPED]: "Nothing to remove",
};
