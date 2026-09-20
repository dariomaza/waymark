import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void): (() => void) => {
  globalThis.addEventListener("online", listener);
  globalThis.addEventListener("offline", listener);

  return () => {
    globalThis.removeEventListener("online", listener);
    globalThis.removeEventListener("offline", listener);
  };
};

/**
 * `navigator.onLine` is a weak signal — it means "there is an interface up",
 * not "the API is reachable" — so it is only ever used to EXPLAIN, never to
 * decide. Requests are attempted regardless, and a request that fails says so
 * on its own screen.
 */
export const useOnlineStatus = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // On a server render there is no navigator; assume the good case.
    () => true,
  );
