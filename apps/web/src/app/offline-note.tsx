import type { JSX } from "react";

import { useOnlineStatus } from "./use-online-status.js";
import "./offline-note.css";
import { useTranslate } from "../app/language-context.js";

/**
 * # What this app promises offline, and what it does not
 *
 * The shell is precached, so Ariadna opens in the corner of a garage with no
 * signal: the screen draws, the navigation works, and whatever was loaded
 * before is still there. Photos already looked at are cached too.
 *
 * Writing is a different thing entirely, and this says so out loud rather
 * than pretending. Queueing a delete, a move or an upload to replay later is
 * a distributed systems problem — two phones and a server disagreeing about
 * an inventory that changed while one of them was in a pocket — and the
 * honest version of this product does not claim to have solved it. Nothing is
 * queued, nothing is replayed, and no write silently succeeds against a
 * server that never heard it.
 */
export const OfflineNote = (): JSX.Element | null => {
  const t = useTranslate();

  const online = useOnlineStatus();

  if (online) {
    return null;
  }

  return (
    <p className="offline-note" role="status" aria-label={t("shell.connection")}>
      Offline. You can look at what is already loaded; nothing you change will be
      saved until the connection is back.
    </p>
  );
};
