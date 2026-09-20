import type { Clock } from "@ariadna/domain";

/**
 * The production `Clock`: the only place in the API allowed to read wall clock
 * time. Every use case receives time through this port, so nothing downstream
 * ever calls `Date.now()` on its own.
 */
export class SystemClock implements Clock {
  now(): Date {
    // A fresh Date per call: `Date` is mutable, and a shared instance would let
    // one caller rewrite another caller's timestamp.
    return new Date();
  }
}
