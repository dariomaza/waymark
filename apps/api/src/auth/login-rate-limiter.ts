import type { Clock } from "@ariadna/domain";

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Failures still available inside the current window. Never negative. */
  readonly remaining: number;
  /** Seconds until the window resets. `0` while the caller is allowed. */
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
  recordFailure(key: string): void;
  clear(key: string): void;
}

export interface FixedWindowRateLimiterOptions {
  readonly clock: Clock;
  /** Failures tolerated inside one window. */
  readonly limit: number;
  readonly windowMs: number;
  /**
   * Upper bound on tracked keys. The limiter lives in memory, so without a cap
   * an attacker rotating source addresses would turn the defence into a memory
   * leak.
   */
  readonly maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 10_000;

interface Window {
  startedAt: number;
  failures: number;
}

/**
 * A fixed window counter, in memory, for failed logins.
 *
 * In memory is the right scope here and not a compromise: Ariadna is a single
 * process on a single homelab box, so a shared store would add a dependency to
 * synchronise state that has exactly one writer. Restarting the API forgets the
 * counters, which is the known cost — and the one an attacker cannot trigger.
 *
 * Only FAILURES are counted, and a successful login clears the key. Someone who
 * knows the password is not the threat; someone guessing is, and guessing is
 * made of failures.
 */
export class FixedWindowRateLimiter implements RateLimiter {
  readonly #windows = new Map<string, Window>();
  readonly #clock: Clock;
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxKeys: number;

  constructor(options: FixedWindowRateLimiterOptions) {
    this.#clock = options.clock;
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  }

  /** Tracked keys, for tests and for a health endpoint to look at. */
  get size(): number {
    return this.#windows.size;
  }

  check(key: string): RateLimitDecision {
    const now = this.#clock.now().getTime();
    const window = this.#windows.get(key);

    if (window === undefined || this.#hasExpired(window, now)) {
      return { allowed: true, remaining: this.#limit, retryAfterSeconds: 0 };
    }

    const remaining = Math.max(0, this.#limit - window.failures);
    if (remaining > 0) {
      return { allowed: true, remaining, retryAfterSeconds: 0 };
    }

    const resetsIn = window.startedAt + this.#windowMs - now;

    return {
      allowed: false,
      remaining: 0,
      // Rounded up and floored at one second: telling a blocked caller to retry
      // in `0` seconds invites an immediate retry that is still blocked.
      retryAfterSeconds: Math.max(1, Math.ceil(resetsIn / 1000)),
    };
  }

  recordFailure(key: string): void {
    const now = this.#clock.now().getTime();
    this.#dropExpired(now);

    const window = this.#windows.get(key);
    if (window !== undefined && !this.#hasExpired(window, now)) {
      window.failures += 1;
      return;
    }

    // Re-inserting keeps the map ordered by recency, which is what the eviction
    // below relies on.
    this.#windows.delete(key);
    this.#evictOldestUntilThereIsRoomFor(1);
    this.#windows.set(key, { startedAt: now, failures: 1 });
  }

  clear(key: string): void {
    this.#windows.delete(key);
  }

  #hasExpired(window: Window, now: number): boolean {
    return now - window.startedAt >= this.#windowMs;
  }

  #dropExpired(now: number): void {
    for (const [key, window] of this.#windows) {
      if (this.#hasExpired(window, now)) {
        this.#windows.delete(key);
      }
    }
  }

  /**
   * Oldest first. A key that has not been touched in a while is the one least
   * likely to be an attack in progress, so it is the one worth forgetting.
   */
  #evictOldestUntilThereIsRoomFor(count: number): void {
    while (this.#windows.size + count > this.#maxKeys) {
      const oldest = this.#windows.keys().next();
      if (oldest.done === true) {
        return;
      }
      this.#windows.delete(oldest.value);
    }
  }
}
