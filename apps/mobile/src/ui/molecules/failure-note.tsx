import { failureTone } from "@ariadna/api-client";
import { describeFailure } from "@ariadna/i18n";
import type { JSX } from "react";

import { Button } from "../atoms/button.js";
import { Callout } from "../atoms/callout.js";
import { useTranslate } from "../../app/language-context.js";

export interface FailureNoteProps {
  readonly error: unknown;
  readonly title?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
}

/**
 * A failure a screen had no specific answer for, in one sentence somebody can
 * act on, in the box its KIND belongs in (ADR 8).
 */
export const FailureNote = ({ error, title, onRetry }: FailureNoteProps): JSX.Element => {
  const t = useTranslate();

  return (
    <Callout
      tone={failureTone(error)}
      {...(title === undefined ? {} : { title })}
      {...(onRetry === undefined
        ? {}
        : { action: <Button onPress={onRetry}>{t("action.tryAgain")}</Button> })}
    >
      {t(describeFailure(error))}
    </Callout>
);
};
