/**
 * # What the service worker holds, and what it refuses to
 *
 * ADR 13 decided the shape: the shell is cached, reads are cached, writes are
 * never queued. This is the read half of that decision, written as data so
 * `vite.config.ts` can hand it to Workbox and a test can pin it — because a
 * route quietly served from a cache is not an error anywhere. It is a screen
 * that is confidently out of date, and nobody reports it as a bug.
 *
 * ## What is here
 *
 * - **Photos**, cache first. A stored file never changes once its background
 *   removal has settled, and a grid of thumbnails is the first screen anybody
 *   opens.
 * - **The forest and every item**, network first. Those are the two screens
 *   that answer "what do I own" with no context at all, so with no signal the
 *   alternative to a stale answer is a screen with nothing on it. A live
 *   answer always wins; the cached one is only ever the fallback for a dead
 *   connection.
 *
 * ## What is deliberately not
 *
 * - **A search.** The screen is query-driven and a stale hit list reads as
 *   "you do not own that", which is the one sentence this product must never
 *   say wrongly.
 * - **One unit or one item.** Both are reached from a list that IS cached,
 *   both are keyed by id so the cache would grow without a bound anybody
 *   chose, and both change on every write — and a write is the thing ADR 13
 *   refuses to queue.
 * - **What background removal is doing.** A queue that moves on its own; a
 *   cached answer is the failure that screen exists to prevent.
 * - **Anything about the session.**
 *
 * Everything here holds the inside of a house, so it all goes on sign-out —
 * see `cached-responses.ts`.
 */

export interface RuntimeCacheRule {
  /** Matched against the pathname of the API request. */
  readonly pattern: RegExp;
  readonly handler: "CacheFirst" | "NetworkFirst";
  readonly options: {
    readonly cacheName: string;
    readonly networkTimeoutSeconds?: number;
    readonly expiration: {
      readonly maxEntries: number;
      readonly maxAgeSeconds: number;
    };
    readonly cacheableResponse: { readonly statuses: number[] };
  };
}

const A_DAY = 60 * 60 * 24;

export const RUNTIME_CACHING: readonly RuntimeCacheRule[] = [
  {
    // `processing` is a route and not a photo id, and it describes a queue
    // rather than a file. Without the exclusion it would be the one thing
    // under `/photos/` that must never be answered from a cache.
    pattern: /^\/photos\/(?!processing$)[^/]+(\/thumbnail)?$/u,
    handler: "CacheFirst",
    options: {
      cacheName: "waymark-photos",
      expiration: { maxEntries: 400, maxAgeSeconds: A_DAY * 30 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // The whole forest (ADR 1) and the whole inventory (ADR 15): the two
    // requests that draw a screen with no other context.
    pattern: /^\/(storage-units|items)$/u,
    handler: "NetworkFirst",
    options: {
      cacheName: "waymark-inventory",
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 8, maxAgeSeconds: A_DAY },
      cacheableResponse: { statuses: [200] },
    },
  },
];

/**
 * Which cache would answer this path, or `null` for one that is always live.
 *
 * The first rule that matches wins, which is the order Workbox itself applies.
 */
export const cacheNameFor = (pathname: string): string | null =>
  RUNTIME_CACHING.find((rule) => rule.pattern.test(pathname))?.options.cacheName ??
  null;

/**
 * The array shape `vite-plugin-pwa` passes straight through to Workbox.
 *
 * Its own types want the options mutable, so they are copied out rather than
 * handed over: the rules above are the source and nothing downstream gets to
 * edit them.
 */
export const workboxRuntimeCaching = RUNTIME_CACHING.map((rule) => ({
  urlPattern: ({ url }: { url: URL }) => rule.pattern.test(url.pathname),
  handler: rule.handler,
  options: {
    ...rule.options,
    expiration: { ...rule.options.expiration },
    cacheableResponse: { statuses: [...rule.options.cacheableResponse.statuses] },
  },
}));
