import { describeFailure, FailureKind, failureKindOf } from "@ariadna/api-client";
import type { JSX } from "react";

import { Button } from "../atoms/button.js";
import { Callout } from "../atoms/callout.js";

export interface FailureNoteProps {
  readonly error: unknown;
  readonly onRetry?: (() => void) | undefined;
  readonly title?: string | undefined;
}

/**
 * What a screen shows when a request did not work.
 *
 * A retry button appears for the failures repeating could actually fix. A
 * deleted box does not come back because you asked twice, and a button that
 * cannot work is worse than no button.
 */
export const FailureNote = ({ error, onRetry, title }: FailureNoteProps): JSX.Element => {
  const worthRetrying = failureKindOf(error) !== FailureKind.NOT_FOUND;

  return (
    <Callout
      tone="wrong"
      {...(title === undefined ? {} : { title })}
      {...(onRetry !== undefined && worthRetrying
        ? {
            action: (
              <Button tone="primary" onClick={onRetry}>
                Try again
              </Button>
            ),
          }
        : {})}
    >
      <p>{describeFailure(error)}</p>
    </Callout>
  );
};
