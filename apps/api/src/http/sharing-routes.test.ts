import { StorageUnitKind } from "@waymark/domain";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MachineTokenScope } from "../auth/machine-token.js";
import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

type Person = "admin" | "ana" | "bea";

interface ShareRow {
  readonly account: { readonly id: string; readonly username: string };
  readonly access: string;
}

const errorOf = (response: LightMyRequestResponse) => ({
  status: response.statusCode,
  code: (response.json() as { error: { code: string } }).error.code,
});

/**
 * # The administrator shares a space (ADR 26)
 *
 * ```
 * GET    /storage-units/:id/shares               who it is shared with, at which level
 * POST   /storage-units/:id/shares/:accountId    { access: "view" | "edit" }
 * DELETE /storage-units/:id/shares/:accountId    stops sharing it with them
 * ```
 *
 * Ana owns a house with a garage in it. Bea and Cleo are people; Dario made
 * the first account, so he is the administrator, and Eve is a second one.
 */
describe("sharing a space over HTTP (ADR 26)", () => {
  let api: TestApi;
  const tokens = new Map<Person, string>();
  const accounts = new Map<string, string>();
  let house = "";
  let garage = "";

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  const as = async (person: Person, options: InjectOptions): Promise<LightMyRequestResponse> =>
    api.app.inject({
      ...options,
      headers: { ...options.headers, ...api.authHeaders(tokens.get(person) ?? "") },
    });

  const space = async (name: string, parentId: string | null): Promise<string> => {
    const response = await as("ana", {
      method: "POST",
      url: "/storage-units",
      payload: { name, kind: StorageUnitKind.ROOM, parentId },
    });
    expect(response.statusCode).toBe(201);

    return (response.json() as { unit: { id: string } }).unit.id;
  };

  beforeEach(async () => {
    await api.reset();
    accounts.clear();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    await api.createUser("ana", "anas-password");
    await api.createUser("bea", "beas-password");
    await api.createUser("cleo", "cleos-password");
    await api.createUser("eve", "eves-password", { administrator: true });
    tokens.set("admin", await api.login());
    tokens.set("ana", await api.login("ana", "anas-password"));
    tokens.set("bea", await api.login("bea", "beas-password"));

    const listed = await as("admin", { method: "GET", url: "/auth/accounts" });
    for (const account of (listed.json() as { accounts: { id: string; username: string }[] })
      .accounts) {
      accounts.set(account.username, account.id);
    }

    house = await space("House", null);
    garage = await space("Garage", house);
  });

  const accountId = (username: string): string => accounts.get(username) ?? "";

  const shareWith = async (
    username: string,
    access: string,
    who: Person = "admin",
    on: string = garage,
  ) =>
    await as(who, {
      method: "POST",
      url: `/storage-units/${on}/shares/${accountId(username)}`,
      payload: { access },
    });

  const sharesOf = async (on: string = garage, who: Person = "admin") =>
    await as(who, { method: "GET", url: `/storage-units/${on}/shares` });

  const listed = async (on: string = garage): Promise<[string, string][]> =>
    ((await sharesOf(on)).json() as { shares: ShareRow[] }).shares.map((share) => [
      share.account.username,
      share.access,
    ]);

  const namesInTreeOf = async (person: Person): Promise<string[]> => {
    const response = await as(person, { method: "GET", url: "/storage-units" });
    const walk = (nodes: { name: string; children: unknown[] }[]): string[] =>
      nodes.flatMap((node) => [node.name, ...walk(node.children as typeof nodes)]);

    return walk((response.json() as { tree: { name: string; children: unknown[] }[] }).tree);
  };

  describe("what the administrator may do", () => {
    it("shares a space to view, and the person then sees it", async () => {
      const response = await shareWith("bea", "view");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        share: { account: { id: accountId("bea"), username: "bea" }, access: "view" },
      });
      expect(await namesInTreeOf("bea")).toEqual(["Garage"]);
    });

    it("lists who a space is shared with, and at which level", async () => {
      await shareWith("bea", "view");
      await shareWith("cleo", "edit");

      expect(await listed()).toEqual([
        ["bea", "view"],
        ["cleo", "edit"],
      ]);
    });

    it("changes a person's level by sharing again, never adding a second share", async () => {
      await shareWith("bea", "view");
      await shareWith("bea", "edit");

      expect(await listed()).toEqual([["bea", "edit"]]);
    });

    it("stops sharing, and the person no longer sees the space", async () => {
      await shareWith("bea", "view");

      const response = await as("admin", {
        method: "DELETE",
        url: `/storage-units/${garage}/shares/${accountId("bea")}`,
      });

      expect(response.statusCode).toBe(204);
      expect(await listed()).toEqual([]);
      expect(await namesInTreeOf("bea")).toEqual([]);
    });

    it("lists only the shares on that space, not those on the spaces around it", async () => {
      await shareWith("bea", "view", "admin", house);

      expect(await listed(garage)).toEqual([]);
      expect(await listed(house)).toEqual([["bea", "view"]]);
    });
  });

  describe("who may not share", () => {
    it("refuses a person who is not an administrator, even the owner, with 403", async () => {
      expect(errorOf(await shareWith("bea", "view", "ana"))).toEqual({
        status: 403,
        code: "ADMINISTRATOR_ONLY",
      });
      expect(errorOf(await sharesOf(garage, "ana"))).toEqual({
        status: 403,
        code: "ADMINISTRATOR_ONLY",
      });
      expect(
        errorOf(
          await as("ana", {
            method: "DELETE",
            url: `/storage-units/${garage}/shares/${accountId("bea")}`,
          }),
        ),
      ).toEqual({ status: 403, code: "ADMINISTRATOR_ONLY" });
      expect(await listed()).toEqual([]);
    });

    it("refuses every machine token with 403, even an administrator's read-write one", async () => {
      const token = await api.createMachineToken("assistant", MachineTokenScope.ReadWrite);
      const machine = api.machineHeaders(token);

      const setting = await api.app.inject({
        method: "POST",
        url: `/storage-units/${garage}/shares/${accountId("bea")}`,
        headers: machine,
        payload: { access: "view" },
      });
      const listing = await api.app.inject({
        method: "GET",
        url: `/storage-units/${garage}/shares`,
        headers: machine,
      });
      const removing = await api.app.inject({
        method: "DELETE",
        url: `/storage-units/${garage}/shares/${accountId("bea")}`,
        headers: machine,
      });

      for (const response of [setting, listing, removing]) {
        expect(errorOf(response)).toEqual({ status: 403, code: "MACHINE_TOKEN_CANNOT_SHARE" });
      }
      expect(await listed()).toEqual([]);
    });
  });

  describe("who a space may not be shared with", () => {
    it("refuses the owner of the tree, who already has edit, with 409", async () => {
      expect(errorOf(await shareWith("ana", "view"))).toEqual({
        status: 409,
        code: "ALREADY_HAS_EDIT",
      });
      expect(await listed()).toEqual([]);
    });

    it("refuses an administrator, who already has edit, with 409", async () => {
      expect(errorOf(await shareWith("eve", "view"))).toEqual({
        status: 409,
        code: "ALREADY_HAS_EDIT",
      });
    });

    it("refuses a disabled account with 409, until it is enabled again", async () => {
      await as("admin", { method: "POST", url: `/auth/accounts/${accountId("cleo")}/disable` });

      expect(errorOf(await shareWith("cleo", "view"))).toEqual({
        status: 409,
        code: "ACCOUNT_DISABLED",
      });

      await as("admin", { method: "POST", url: `/auth/accounts/${accountId("cleo")}/enable` });
      expect((await shareWith("cleo", "view")).statusCode).toBe(200);
    });

    it("answers an account that does not exist as the account routes do, 404", async () => {
      const response = await as("admin", {
        method: "POST",
        url: `/storage-units/${garage}/shares/no-such-account`,
        payload: { access: "view" },
      });

      expect(errorOf(response)).toEqual({ status: 404, code: "ACCOUNT_NOT_FOUND" });
    });

    it("answers a space that does not exist with 404", async () => {
      const response = await as("admin", {
        method: "POST",
        url: `/storage-units/no-such-space/shares/${accountId("bea")}`,
        payload: { access: "view" },
      });

      expect(errorOf(response)).toEqual({ status: 404, code: "STORAGE_UNIT_NOT_FOUND" });
    });

    it("refuses a level that is neither view nor edit with 400", async () => {
      expect((await shareWith("bea", "own")).statusCode).toBe(400);
    });
  });
});
