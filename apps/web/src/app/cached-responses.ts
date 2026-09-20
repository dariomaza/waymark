/**
 * Everything the service worker is holding, thrown away.
 *
 * The caches hold photographs of the inside of a house and the pages that
 * show them. A phone is lent to somebody, a session ends, and what is left on
 * disk must not outlive the token — the shell is precached and will simply be
 * fetched again.
 *
 * `caches` does not exist in every browser or in a private window, and it can
 * throw; failing to clear a cache must never be the thing that stops somebody
 * signing out.
 */
export const clearCachedResponses = async (): Promise<void> => {
  try {
    const store = globalThis.caches as CacheStorage | undefined;
    if (store === undefined) {
      return;
    }

    const names = await store.keys();
    await Promise.all(names.map(async (name) => store.delete(name)));
  } catch {
    // Signing out already happened; this was the tidying up.
  }
};
