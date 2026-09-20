import { FakeClock } from "@ariadna/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { FixedWindowRateLimiter } from "./login-rate-limiter.js";

const START = new Date("2026-04-01T10:00:00.000Z");
const MINUTE = 60_000;

describe("FixedWindowRateLimiter", () => {
  let clock: FakeClock;
  let limiter: FixedWindowRateLimiter;

  beforeEach(() => {
    clock = new FakeClock(START);
    limiter = new FixedWindowRateLimiter({
      clock,
      limit: 5,
      windowMs: 15 * MINUTE,
    });
  });

  const failTimes = (key: string, times: number): void => {
    for (let attempt = 0; attempt < times; attempt += 1) {
      limiter.recordFailure(key);
    }
  };

  it("allows an unknown key", () => {
    expect(limiter.check("203.0.113.7").allowed).toBe(true);
  });

  it("allows exactly the configured number of failures", () => {
    failTimes("203.0.113.7", 4);

    expect(limiter.check("203.0.113.7").allowed).toBe(true);
  });

  it("blocks once the limit is reached", () => {
    failTimes("203.0.113.7", 5);

    expect(limiter.check("203.0.113.7").allowed).toBe(false);
  });

  it("reports how long the caller has to wait", () => {
    failTimes("203.0.113.7", 5);
    clock.advanceBy(5 * MINUTE);

    expect(limiter.check("203.0.113.7").retryAfterSeconds).toBe(10 * 60);
  });

  it("never reports a retry delay below one second while blocked", () => {
    failTimes("203.0.113.7", 5);
    clock.advanceBy(15 * MINUTE - 1);

    expect(limiter.check("203.0.113.7").retryAfterSeconds).toBe(1);
  });

  it("counts each key on its own, so one attacker cannot lock everyone out", () => {
    failTimes("203.0.113.7", 5);

    expect(limiter.check("198.51.100.4").allowed).toBe(true);
  });

  it("forgets the failures once the window has passed", () => {
    failTimes("203.0.113.7", 5);
    clock.advanceBy(15 * MINUTE);

    expect(limiter.check("203.0.113.7").allowed).toBe(true);
  });

  it("clears the count on a successful login", () => {
    failTimes("203.0.113.7", 4);

    limiter.clear("203.0.113.7");

    expect(limiter.check("203.0.113.7").remaining).toBe(5);
  });

  it("reports the remaining attempts, so a client can be told before it is cut off", () => {
    failTimes("203.0.113.7", 2);

    expect(limiter.check("203.0.113.7").remaining).toBe(3);
  });

  it("never reports a negative number of remaining attempts", () => {
    failTimes("203.0.113.7", 50);

    expect(limiter.check("203.0.113.7").remaining).toBe(0);
  });

  describe("memory", () => {
    it("drops expired keys instead of remembering every IP that ever knocked", () => {
      failTimes("203.0.113.7", 1);
      clock.advanceBy(15 * MINUTE);

      failTimes("198.51.100.4", 1);

      expect(limiter.size).toBe(1);
    });

    it("refuses to grow past its cap, so a rotating attacker cannot exhaust memory", () => {
      const capped = new FixedWindowRateLimiter({
        clock,
        limit: 5,
        windowMs: 15 * MINUTE,
        maxKeys: 10,
      });

      for (let key = 0; key < 1_000; key += 1) {
        capped.recordFailure(`198.51.100.${key}`);
      }

      expect(capped.size).toBeLessThanOrEqual(10);
    });

    it("evicts the oldest key first, so the most recent attacker stays counted", () => {
      const capped = new FixedWindowRateLimiter({
        clock,
        limit: 5,
        windowMs: 15 * MINUTE,
        maxKeys: 2,
      });

      capped.recordFailure("oldest");
      clock.advanceBy(MINUTE);
      capped.recordFailure("middle");
      clock.advanceBy(MINUTE);
      capped.recordFailure("newest");

      expect(capped.check("oldest").remaining).toBe(5);
      expect(capped.check("newest").remaining).toBe(4);
    });
  });
});
