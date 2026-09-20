import type { Clock } from "./clock.js";

/** Deterministic clock for tests. It only moves when a test moves it. */
export class FakeClock implements Clock {
  #current: Date;

  constructor(start: Date) {
    this.#current = start;
  }

  now(): Date {
    return new Date(this.#current);
  }

  advanceTo(instant: Date): void {
    this.#current = instant;
  }

  advanceBy(milliseconds: number): void {
    this.#current = new Date(this.#current.getTime() + milliseconds);
  }
}
