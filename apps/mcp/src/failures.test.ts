import { ApiError, OFFLINE_STATUS } from "@waymark/api-client";
import { describe, expect, it } from "vitest";

import { sentenceFor } from "./failures.js";
import { withoutSecret } from "./redacting.js";

const WHERE = { baseUrl: "https://waymark.example", doing: "search the inventory" };

describe("turning a refusal into something a reader can act on", () => {
  it("says the API could not be reached, and where it looked", () => {
    const sentence = sentenceFor(
      new ApiError(OFFLINE_STATUS, "OFFLINE", "The app could not reach Waymark"),
      WHERE,
    );

    expect(sentence).toContain("https://waymark.example");
    expect(sentence).toMatch(/could not be reached|not answering/iu);
  });

  it("says the token was refused, and that a new one has to be issued", () => {
    const sentence = sentenceFor(
      new ApiError(401, "INVALID_MACHINE_TOKEN", "The machine token is invalid"),
      WHERE,
    );

    expect(sentence).toMatch(/refused/iu);
    expect(sentence).toContain("machine-token create");
  });

  it("says a read-only token cannot write, rather than repeating a 403", () => {
    const sentence = sentenceFor(
      new ApiError(403, "READ_ONLY_MACHINE_TOKEN", 'The machine token "mcp-server" is read-only', {
        machineTokenName: "mcp-server",
        method: "POST",
        requiredScope: "read-write",
      }),
      { ...WHERE, doing: 'add "Soldering iron" to Box 3' },
    );

    expect(sentence).toContain("read-only");
    expect(sentence).toContain("mcp-server");
    expect(sentence).toContain("read-write");
    expect(sentence).toMatch(/nothing was changed/iu);
    expect(sentence).not.toContain("403");
  });

  it("gives the four situations four different sentences", () => {
    const four = [
      sentenceFor(new ApiError(OFFLINE_STATUS, "OFFLINE", "unreachable"), WHERE),
      sentenceFor(new ApiError(401, "INVALID_MACHINE_TOKEN", "no"), WHERE),
      sentenceFor(
        new ApiError(403, "READ_ONLY_MACHINE_TOKEN", "no", { machineTokenName: "mcp" }),
        WHERE,
      ),
      sentenceFor(new ApiError(404, "NOT_FOUND", "no such storage unit"), WHERE),
    ];

    expect(new Set(four).size).toBe(4);
  });

  it("passes on what the API said about a refusal it made on purpose", () => {
    const sentence = sentenceFor(
      new ApiError(422, "VALIDATION_FAILED", "quantity must be a positive integer"),
      WHERE,
    );

    expect(sentence).toContain("quantity must be a positive integer");
  });

  it("answers a failure that is not the API's at all without a stack trace", () => {
    const sentence = sentenceFor(new TypeError("Cannot read properties of undefined"), WHERE);

    expect(sentence).not.toContain("at ");
    expect(sentence).toMatch(/search the inventory/u);
  });
});

describe("keeping the credential out of everything this server says", () => {
  const TOKEN = "wmk_hhKABz-fSeDJwWCfiNRkmB9BoSGcv6wrPAhTya7CW28";

  it("replaces the token wherever it turns up in an answer", () => {
    expect(withoutSecret(`presented ${TOKEN} twice: ${TOKEN}`, TOKEN)).toBe(
      "presented wmk_[redacted] twice: wmk_[redacted]",
    );
  });

  it("leaves text that does not hold it exactly as it was", () => {
    expect(withoutSecret("Garage > Box 3", TOKEN)).toBe("Garage > Box 3");
  });

  it("is a no-op when there is no token to keep out", () => {
    expect(withoutSecret("anything", null)).toBe("anything");
  });
});
