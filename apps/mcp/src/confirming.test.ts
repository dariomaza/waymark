import { describe, expect, it } from "vitest";

import { CONFIRMATION_LIFETIME_MS, WriteConfirmations } from "./confirming.js";

interface APlan {
  readonly what: string;
}

const A_PLAN: APlan = { what: "add Soldering iron to Box 3" };

describe("the confirmation a write needs before it happens", () => {
  it("mints a code that could not have been worked out from the request", () => {
    const confirmations = new WriteConfirmations();

    const first = confirmations.propose("add|box-3|iron", A_PLAN);
    const second = confirmations.propose("add|box-3|iron", A_PLAN);

    expect(first).not.toBe(second);
    expect(first).not.toContain("box-3");
    expect(first).not.toContain("iron");
    expect(first.length).toBeGreaterThanOrEqual(8);
  });

  /**
   * The point of the whole mechanism. None of these is a code, and a reader
   * that reaches for one has guessed rather than been told.
   */
  it.each(["yes", "YES", "true", "confirm", "I confirm", "ok", "", "0"])(
    "refuses %o, which is what a guess looks like",
    (guess) => {
      const confirmations = new WriteConfirmations();
      confirmations.propose("add|box-3|iron", A_PLAN);

      expect(confirmations.claim(guess, "add|box-3|iron").kind).toBe("unknown");
    },
  );

  it("performs the plan the code was minted for, and hands it back", () => {
    const confirmations = new WriteConfirmations();
    const code = confirmations.propose("add|box-3|iron", A_PLAN);

    expect(confirmations.claim(code, "add|box-3|iron")).toEqual({
      kind: "confirmed",
      plan: A_PLAN,
    });
  });

  /**
   * A code is bound to exactly what was described, so a reader cannot take the
   * confirmation it was given for one write and spend it on another. This is
   * the difference between confirming a PLAN and confirming a FEELING.
   */
  it("refuses a code that was minted for a different write", () => {
    const confirmations = new WriteConfirmations();
    const code = confirmations.propose("move|box-3|a,b", A_PLAN);

    expect(confirmations.claim(code, "move|attic|a,b").kind).toBe("mismatched");
    expect(confirmations.claim(code, "move|box-3|a,b,c").kind).toBe("mismatched");
  });

  it("does not spend a code on a request that did not match it", () => {
    const confirmations = new WriteConfirmations();
    const code = confirmations.propose("move|box-3|a,b", A_PLAN);

    confirmations.claim(code, "move|attic|a,b");

    expect(confirmations.claim(code, "move|box-3|a,b").kind).toBe("confirmed");
  });

  it("spends a code once, so a repeated call cannot write twice", () => {
    const confirmations = new WriteConfirmations();
    const code = confirmations.propose("add|box-3|iron", A_PLAN);

    expect(confirmations.claim(code, "add|box-3|iron").kind).toBe("confirmed");
    expect(confirmations.claim(code, "add|box-3|iron").kind).toBe("unknown");
  });

  it("lets a code lapse, so a confirmation cannot be banked for later", () => {
    let now = 1_000;
    const confirmations = new WriteConfirmations(() => now);
    const code = confirmations.propose("add|box-3|iron", A_PLAN);

    now += CONFIRMATION_LIFETIME_MS + 1;

    expect(confirmations.claim(code, "add|box-3|iron").kind).toBe("unknown");
  });

  it("holds one that has not lapsed yet", () => {
    let now = 1_000;
    const confirmations = new WriteConfirmations(() => now);
    const code = confirmations.propose("add|box-3|iron", A_PLAN);

    now += CONFIRMATION_LIFETIME_MS - 1;

    expect(confirmations.claim(code, "add|box-3|iron").kind).toBe("confirmed");
  });
});
