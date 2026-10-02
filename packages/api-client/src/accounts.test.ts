import { Role } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ApiError, ApiErrorCode } from "./api-error.js";
import { queryKeys } from "./query-keys.js";
import { anAccount } from "./testing/fixtures.js";
import { createWaymarkClient } from "./waymark-client.js";

/**
 * # The calls the People group makes (ADR 26)
 *
 * An administrator lists, creates and changes the other accounts. These run
 * against MSW answering the way `apps/api` does, so a shape that would break
 * the People group breaks here first.
 */
const API_URL = "http://127.0.0.1:3000";

const apiServer = setupServer();

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  apiServer.resetHandlers();
});
afterAll(() => {
  apiServer.close();
});

const client = () =>
  createWaymarkClient<File>({
    baseUrl: API_URL,
    token: () => "a-live-token",
    appendPhoto: (form, field, file) => {
      form.append(field, file, file.name);
    },
  });

interface Seen {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

const recording = (seen: Seen[], answer: unknown, status = 200) =>
  async ({ request }: { request: Request }) => {
    const text = await request.text();
    seen.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: text === "" ? undefined : (JSON.parse(text) as unknown),
    });

    return HttpResponse.json(answer as never, { status });
  };

describe("managing accounts from a client", () => {
  it("lists every account with its role and whether it is disabled", async () => {
    apiServer.use(
      http.get(`${API_URL}/auth/accounts`, () =>
        HttpResponse.json({
          accounts: [
            anAccount({ username: "dario", role: Role.ADMINISTRATOR }),
            anAccount({ id: "u2", username: "partner", disabledAt: "2026-10-01T10:00:00.000Z" }),
          ],
        }),
      ),
    );

    const { accounts } = await client().accounts();

    expect(accounts.map((account) => [account.username, account.role, account.disabledAt])).toEqual([
      ["dario", Role.ADMINISTRATOR, null],
      ["partner", Role.USER, "2026-10-01T10:00:00.000Z"],
    ]);
  });

  it("creates one with the username, the password and the role", async () => {
    const seen: Seen[] = [];
    apiServer.use(
      http.post(`${API_URL}/auth/accounts`, recording(seen, { account: anAccount() }, 201)),
    );

    const { account } = await client().createAccount({
      username: "partner",
      password: "the-partner-password",
      role: Role.USER,
    });

    expect(seen).toEqual([
      {
        method: "POST",
        path: "/auth/accounts",
        body: { username: "partner", password: "the-partner-password", role: Role.USER },
      },
    ]);
    expect(account.username).toBe("partner");
  });

  it("changes a role, resets a password, disables and enables, each by the account's id", async () => {
    const seen: Seen[] = [];
    const answer = { account: anAccount() };
    apiServer.use(
      http.post(`${API_URL}/auth/accounts/:id/role`, recording(seen, answer)),
      http.post(`${API_URL}/auth/accounts/:id/password`, recording(seen, answer)),
      http.post(`${API_URL}/auth/accounts/:id/disable`, recording(seen, answer)),
      http.post(`${API_URL}/auth/accounts/:id/enable`, recording(seen, answer)),
    );

    await client().changeAccountRole("u 2", Role.ADMINISTRATOR);
    await client().resetAccountPassword("u 2", "a-brand-new-password");
    await client().disableAccount("u 2");
    await client().enableAccount("u 2");

    expect(seen).toEqual([
      { method: "POST", path: "/auth/accounts/u%202/role", body: { role: Role.ADMINISTRATOR } },
      { method: "POST", path: "/auth/accounts/u%202/password", body: { password: "a-brand-new-password" } },
      { method: "POST", path: "/auth/accounts/u%202/disable", body: undefined },
      { method: "POST", path: "/auth/accounts/u%202/enable", body: undefined },
    ]);
  });

  it("hands back the API's refusal with its code", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/accounts/:id/disable`, () =>
        HttpResponse.json(
          { error: { code: "LAST_ADMINISTRATOR", message: "This is the last active administrator" } },
          { status: 409 },
        ),
      ),
    );

    const refusal = await client()
      .disableAccount("u1")
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ApiError);
    expect((refusal as ApiError).code).toBe(ApiErrorCode.LAST_ADMINISTRATOR);
  });

  it("keeps its list outside the inventory's cache keys", () => {
    expect(queryKeys.accounts()).toEqual(["accounts"]);
  });
});

describe("the codes of managing accounts", () => {
  it("names every refusal the API can make", () => {
    expect([
      ApiErrorCode.ADMINISTRATOR_ONLY,
      ApiErrorCode.MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS,
      ApiErrorCode.ACCOUNT_NOT_FOUND,
      ApiErrorCode.USERNAME_ALREADY_TAKEN,
      ApiErrorCode.LAST_ADMINISTRATOR,
      ApiErrorCode.OWN_ACCOUNT,
      ApiErrorCode.PASSWORD_TOO_SHORT,
      ApiErrorCode.INVALID_USERNAME,
    ]).toEqual([
      "ADMINISTRATOR_ONLY",
      "MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS",
      "ACCOUNT_NOT_FOUND",
      "USERNAME_ALREADY_TAKEN",
      "LAST_ADMINISTRATOR",
      "OWN_ACCOUNT",
      "PASSWORD_TOO_SHORT",
      "INVALID_USERNAME",
    ]);
  });
});
