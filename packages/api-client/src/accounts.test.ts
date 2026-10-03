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

  it("creates one with the username and the role, and hands back its temporary password", async () => {
    const seen: Seen[] = [];
    apiServer.use(
      http.post(
        `${API_URL}/auth/accounts`,
        recording(
          seen,
          { account: anAccount({ mustChangePassword: true }), temporaryPassword: "abcd-efgh-jkmn-pqrs" },
          201,
        ),
      ),
    );

    const { account, temporaryPassword } = await client().createAccount({
      username: "partner",
      role: Role.USER,
    });

    expect(seen).toEqual([
      { method: "POST", path: "/auth/accounts", body: { username: "partner", role: Role.USER } },
    ]);
    expect(account.mustChangePassword).toBe(true);
    expect(temporaryPassword).toBe("abcd-efgh-jkmn-pqrs");
  });

  it("resets a password with no body, and hands back the temporary one", async () => {
    const seen: Seen[] = [];
    apiServer.use(
      http.post(
        `${API_URL}/auth/accounts/:id/password`,
        recording(seen, { account: anAccount(), temporaryPassword: "abcd-efgh-jkmn-pqrs" }),
      ),
    );

    const { temporaryPassword } = await client().resetAccountPassword("u 2");

    expect(seen).toEqual([{ method: "POST", path: "/auth/accounts/u%202/password", body: undefined }]);
    expect(temporaryPassword).toBe("abcd-efgh-jkmn-pqrs");
  });

  it("changes a role, disables and enables, each by the account's id", async () => {
    const seen: Seen[] = [];
    const answer = { account: anAccount() };
    apiServer.use(
      http.post(`${API_URL}/auth/accounts/:id/role`, recording(seen, answer)),
      http.post(`${API_URL}/auth/accounts/:id/disable`, recording(seen, answer)),
      http.post(`${API_URL}/auth/accounts/:id/enable`, recording(seen, answer)),
    );

    await client().changeAccountRole("u 2", Role.ADMINISTRATOR);
    await client().disableAccount("u 2");
    await client().enableAccount("u 2");

    expect(seen).toEqual([
      { method: "POST", path: "/auth/accounts/u%202/role", body: { role: Role.ADMINISTRATOR } },
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
      ApiErrorCode.PASSWORD_CHANGE_REQUIRED,
      ApiErrorCode.PASSWORD_UNCHANGED,
      ApiErrorCode.CURRENT_PASSWORD_REQUIRED,
    ]).toEqual([
      "ADMINISTRATOR_ONLY",
      "MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS",
      "ACCOUNT_NOT_FOUND",
      "USERNAME_ALREADY_TAKEN",
      "LAST_ADMINISTRATOR",
      "OWN_ACCOUNT",
      "PASSWORD_TOO_SHORT",
      "INVALID_USERNAME",
      "PASSWORD_CHANGE_REQUIRED",
      "PASSWORD_UNCHANGED",
      "CURRENT_PASSWORD_REQUIRED",
    ]);
  });
});

/**
 * # Changing your own password (ADR 26, amended)
 *
 * Every signed-in person may; with a temporary password it is the one thing
 * they may do, and the current password is not sent.
 */
describe("changing your own password from a client", () => {
  it("sends the new password and the current one", async () => {
    const seen: Seen[] = [];
    apiServer.use(
      http.post(`${API_URL}/auth/password`, recording(seen, { user: anAccount() })),
    );

    const { user } = await client().changeOwnPassword({
      password: "a-password-of-my-own",
      currentPassword: "the-old-password",
    });

    expect(seen).toEqual([
      {
        method: "POST",
        path: "/auth/password",
        body: { password: "a-password-of-my-own", currentPassword: "the-old-password" },
      },
    ]);
    expect(user.username).toBe("partner");
  });

  it("sends no current password when there is none to send", async () => {
    const seen: Seen[] = [];
    apiServer.use(
      http.post(`${API_URL}/auth/password`, recording(seen, { user: anAccount() })),
    );

    await client().changeOwnPassword({ password: "a-password-of-my-own" });

    expect(seen[0]?.body).toEqual({ password: "a-password-of-my-own" });
  });

  /**
   * A wrong current password is refused as a sign-in refuses one, with a 401.
   * The session that sent it is fine, and the person must not be signed out
   * for a typo.
   */
  it("does not end the session over a wrong current password", async () => {
    let signedOut = false;
    apiServer.use(
      http.post(`${API_URL}/auth/password`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } },
          { status: 401 },
        ),
      ),
    );

    const refusal = await createWaymarkClient<File>({
      baseUrl: API_URL,
      token: () => "a-live-token",
      onUnauthorized: () => {
        signedOut = true;
      },
      appendPhoto: () => undefined,
    })
      .changeOwnPassword({ password: "a-password-of-my-own", currentPassword: "a-typo" })
      .catch((error: unknown) => error);

    expect((refusal as ApiError).code).toBe(ApiErrorCode.INVALID_CREDENTIALS);
    expect(signedOut).toBe(false);
  });

  it("still ends it when the session itself is refused", async () => {
    let signedOut = false;
    apiServer.use(
      http.post(`${API_URL}/auth/password`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_SESSION", message: "The session token is missing" } },
          { status: 401 },
        ),
      ),
    );

    await createWaymarkClient<File>({
      baseUrl: API_URL,
      token: () => "a-live-token",
      onUnauthorized: () => {
        signedOut = true;
      },
      appendPhoto: () => undefined,
    })
      .changeOwnPassword({ password: "a-password-of-my-own" })
      .catch(() => undefined);

    expect(signedOut).toBe(true);
  });
});
