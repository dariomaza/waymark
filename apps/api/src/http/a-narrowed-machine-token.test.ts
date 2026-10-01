import { ShareLevel, StorageUnitKind } from "@waymark/domain";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

interface UnitView {
  readonly id: string;
  readonly name: string;
}

interface TreeNode extends UnitView {
  readonly children: readonly TreeNode[];
}

interface ListedToken {
  readonly name: string;
  readonly spaces: readonly UnitView[] | null;
}

type Person = "admin" | "ana" | "bea";

const errorOf = (response: LightMyRequestResponse) => ({
  status: response.statusCode,
  code: (response.json() as { error: { code: string } }).error.code,
});

const flatten = (nodes: readonly TreeNode[]): string[] =>
  nodes.flatMap((node) => [node.name, ...flatten(node.children)]);

/**
 * # A machine token narrowed to chosen spaces, over HTTP (ADR 26)
 *
 * The household of `what-each-person-may-see.test.ts`: Ana's house holds a
 * garage (a shelf on it, the drill on the shelf) shared with Bea to view, an
 * attic (the lamp) shared with Bea to edit, and a safe (a jewel box inside)
 * shared with nobody. Bea has a flat with a wardrobe. Dario is the
 * administrator.
 *
 * Tokens are issued the way a person issues them, from their session.
 */
describe("a machine token narrowed to chosen spaces, over HTTP (ADR 26)", () => {
  let api: TestApi;
  const sessions = new Map<Person, string>();
  const spaces = new Map<string, UnitView>();

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  const as = (person: Person, options: InjectOptions): Promise<LightMyRequestResponse> =>
    api.app.inject({
      ...options,
      headers: { ...options.headers, ...api.authHeaders(sessions.get(person) ?? "") },
    });

  const withToken = (token: string, options: InjectOptions): Promise<LightMyRequestResponse> =>
    api.app.inject({ ...options, headers: { ...options.headers, ...api.machineHeaders(token) } });

  const space = async (person: Person, name: string, parent: string | null = null) => {
    const response = await as(person, {
      method: "POST",
      url: "/storage-units",
      payload: { name, kind: StorageUnitKind.BOX, parentId: parent === null ? null : idOf(parent) },
    });
    expect(response.statusCode).toBe(201);
    spaces.set(name, (response.json() as { unit: UnitView }).unit);
  };

  const item = async (person: Person, name: string, within: string) => {
    const response = await as(person, {
      method: "POST",
      url: "/items",
      payload: { name, storageUnitId: idOf(within) },
    });
    expect(response.statusCode).toBe(201);
  };

  const idOf = (name: string): string => {
    const found = spaces.get(name)?.id;
    if (found === undefined) {
      throw new Error(`No space called "${name}" in the fixture`);
    }
    return found;
  };

  /** Issues a token from a person's session, narrowed to the spaces named. */
  const issue = async (
    person: Person,
    name: string,
    scope: "read" | "read-write",
    within: readonly string[],
  ): Promise<string> => {
    const response = await as(person, {
      method: "POST",
      url: "/auth/machine-tokens",
      payload: { name, scope, spaceIds: within.map(idOf) },
    });
    expect(response.statusCode).toBe(201);

    return (response.json() as { token: string }).token;
  };

  const treeOf = async (token: string): Promise<string[]> => {
    const response = await withToken(token, { method: "GET", url: "/storage-units" });
    expect(response.statusCode).toBe(200);

    return flatten((response.json() as { tree: TreeNode[] }).tree).sort();
  };

  const itemsOf = async (token: string): Promise<string[]> => {
    const response = await withToken(token, { method: "GET", url: "/items" });
    expect(response.statusCode).toBe(200);

    return (response.json() as { items: { item: { name: string } }[] }).items
      .map((row) => row.item.name)
      .sort();
  };

  const listOf = async (person: Person): Promise<ListedToken[]> =>
    ((await as(person, { method: "GET", url: "/auth/machine-tokens" })).json() as {
      machineTokens: ListedToken[];
    }).machineTokens;

  beforeEach(async () => {
    await api.reset();
    spaces.clear();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    await api.createUser("ana", "anas-password");
    await api.createUser("bea", "beas-password");
    sessions.set("admin", await api.login());
    sessions.set("ana", await api.login("ana", "anas-password"));
    sessions.set("bea", await api.login("bea", "beas-password"));

    await space("ana", "Ana house");
    await space("ana", "Ana garage", "Ana house");
    await space("ana", "Ana shelf", "Ana garage");
    await space("ana", "Ana attic", "Ana house");
    await space("ana", "Ana safe", "Ana house");
    await space("ana", "Ana jewel box", "Ana safe");
    await item("ana", "Ana drill", "Ana shelf");
    await item("ana", "Ana lamp", "Ana attic");
    await item("ana", "Ana passport", "Ana safe");
    await space("bea", "Bea flat");
    await space("bea", "Bea wardrobe", "Bea flat");
    await item("bea", "Bea scarf", "Bea wardrobe");

    await api.share(idOf("Ana garage"), "bea", ShareLevel.VIEW);
    await api.share(idOf("Ana attic"), "bea", ShareLevel.EDIT);
  });

  describe("Bea's token narrowed to the garage shared with her", () => {
    it("reads only that subtree", async () => {
      const token = await issue("bea", "beas-garage", "read", ["Ana garage"]);

      expect(await treeOf(token)).toEqual(["Ana garage", "Ana shelf"]);
      expect(await itemsOf(token)).toEqual(["Ana drill"]);
    });

    it("gets the answer a missing id gets for Bea's own tree outside it", async () => {
      const token = await issue("bea", "beas-garage", "read", ["Ana garage"]);
      const missing = await withToken(token, {
        method: "GET",
        url: "/storage-units/00000000-0000-4000-8000-000000000000",
      });

      const flat = await withToken(token, { method: "GET", url: `/storage-units/${idOf("Bea flat")}` });

      expect(errorOf(flat)).toEqual({ status: 404, code: "STORAGE_UNIT_NOT_FOUND" });
      expect(errorOf(flat)).toEqual(errorOf(missing));
    });

    it("may not write there even read-write, because Bea may only view it", async () => {
      const token = await issue("bea", "beas-garage-rw", "read-write", ["Ana garage"]);

      const response = await withToken(token, {
        method: "POST",
        url: "/items",
        payload: { name: "New thing", storageUnitId: idOf("Ana shelf") },
      });

      expect(errorOf(response)).toEqual({ status: 403, code: "VIEW_ONLY" });
    });
  });

  describe("Bea's token narrowed to the attic she may edit", () => {
    const putALampIn = (token: string, where: string) =>
      withToken(token, {
        method: "POST",
        url: "/items",
        payload: { name: "Another lamp", storageUnitId: idOf(where) },
      });

    it("writes there when it is read-write, because Bea has edit", async () => {
      const token = await issue("bea", "beas-attic-rw", "read-write", ["Ana attic"]);

      expect((await putALampIn(token, "Ana attic")).statusCode).toBe(201);
    });

    it("may not write there when it is read only: its scope still applies on top", async () => {
      const token = await issue("bea", "beas-attic", "read", ["Ana attic"]);

      expect(errorOf(await putALampIn(token, "Ana attic"))).toEqual({
        status: 403,
        code: "READ_ONLY_MACHINE_TOKEN",
      });
    });

    it("may not write in Bea's own flat, which was not chosen, as if it did not exist", async () => {
      const token = await issue("bea", "beas-attic-rw", "read-write", ["Ana attic"]);

      expect(errorOf(await putALampIn(token, "Bea wardrobe"))).toEqual({
        status: 422,
        code: "STORAGE_UNIT_NOT_FOUND",
      });
    });

    it("loses the attic when Bea loses its share, with nothing to remember", async () => {
      const token = await issue("bea", "beas-attic", "read", ["Ana attic"]);
      const bea = await api.database.client.user.findUnique({ where: { username: "bea" } });

      await api.database.client.share.delete({
        where: {
          storageUnitId_userId: { storageUnitId: idOf("Ana attic"), userId: bea?.id ?? "" },
        },
      });

      expect(await treeOf(token)).toEqual([]);
      expect(await itemsOf(token)).toEqual([]);
    });
  });

  it("gives an administrator's token narrowed to Ana's unshared safe only that safe", async () => {
    const token = await issue("admin", "admins-safe", "read", ["Ana safe"]);

    expect(await treeOf(token)).toEqual(["Ana jewel box", "Ana safe"]);
    expect(await itemsOf(token)).toEqual(["Ana passport"]);
  });

  /**
   * The edge the design is shaped around: the spaces go, the token stays
   * narrowed, and it reaches nothing rather than all of Bea's reach.
   */
  it("reaches nothing once every chosen space has been deleted", async () => {
    await space("bea", "Bea drawer", "Bea flat");
    const token = await issue("bea", "beas-drawer", "read", ["Bea drawer"]);

    const deleted = await as("bea", { method: "DELETE", url: `/storage-units/${idOf("Bea drawer")}` });
    expect(deleted.statusCode).toBe(204);

    expect(await treeOf(token)).toEqual([]);
    expect(await itemsOf(token)).toEqual([]);
    expect((await listOf("bea"))[0]?.spaces).toEqual([]);
  });

  describe("the top of the tree, which is outside its spaces", () => {
    it("may not make a root, though its issuer may", async () => {
      const token = await issue("ana", "anas-garage-rw", "read-write", ["Ana garage"]);

      const response = await withToken(token, {
        method: "POST",
        url: "/storage-units",
        payload: { name: "New root", kind: StorageUnitKind.ROOM, parentId: null },
      });

      expect(errorOf(response)).toEqual({ status: 403, code: "OUTSIDE_TOKEN_SPACES" });
    });

    it("may not move a space to the top", async () => {
      const token = await issue("ana", "anas-garage-rw", "read-write", ["Ana garage"]);

      const response = await withToken(token, {
        method: "POST",
        url: `/storage-units/${idOf("Ana shelf")}/move`,
        payload: { parentId: null },
      });

      expect(errorOf(response)).toEqual({ status: 403, code: "OUTSIDE_TOKEN_SPACES" });
    });
  });

  describe("POST /auth/machine-tokens with spaces", () => {
    const create = (person: Person, payload: Record<string, unknown>) =>
      as(person, { method: "POST", url: "/auth/machine-tokens", payload });

    it("refuses a space the issuer cannot see as a missing one is refused, and issues nothing", async () => {
      const missing = await create("bea", {
        name: "beas",
        scope: "read",
        spaceIds: ["00000000-0000-4000-8000-000000000000"],
      });

      const unseen = await create("bea", { name: "beas", scope: "read", spaceIds: [idOf("Ana safe")] });

      expect(errorOf(unseen)).toEqual({ status: 422, code: "STORAGE_UNIT_NOT_FOUND" });
      expect(errorOf(unseen)).toEqual(errorOf(missing));
      expect(await listOf("bea")).toEqual([]);
    });

    it("refuses an empty list: no spaces chosen is said by leaving it out", async () => {
      expect((await create("bea", { name: "beas", scope: "read", spaceIds: [] })).statusCode).toBe(400);
    });

    it("keeps each space once, and not one inside another", async () => {
      await issue("ana", "anas", "read", ["Ana shelf", "Ana attic", "Ana garage", "Ana attic"]);

      expect((await listOf("ana"))[0]?.spaces?.map((unit) => unit.name)).toEqual([
        "Ana attic",
        "Ana garage",
      ]);
    });
  });

  describe("listing and rotating", () => {
    it("lists the chosen spaces by name, and null for a token that was not narrowed", async () => {
      await issue("bea", "beas-garage", "read", ["Ana garage"]);
      await create("bea", "beas-whole");

      expect(
        (await listOf("bea")).map((token) => [token.name, token.spaces?.map((unit) => unit.name) ?? null]),
      ).toEqual([
        ["beas-garage", ["Ana garage"]],
        ["beas-whole", null],
      ]);
    });

    it("keeps the chosen spaces across a rotation", async () => {
      await issue("bea", "beas-garage", "read", ["Ana garage"]);

      const rotated = await as("bea", {
        method: "POST",
        url: "/auth/machine-tokens/beas-garage/rotate",
        payload: {},
      });

      expect(rotated.statusCode).toBe(200);
      expect(await treeOf((rotated.json() as { token: string }).token)).toEqual([
        "Ana garage",
        "Ana shelf",
      ]);
    });

    it("refuses a rotation that names spaces, rather than ignoring it", async () => {
      await issue("bea", "beas-garage", "read", ["Ana garage"]);

      const response = await as("bea", {
        method: "POST",
        url: "/auth/machine-tokens/beas-garage/rotate",
        payload: { spaceIds: [idOf("Bea flat")] },
      });

      expect(response.statusCode).toBe(400);
      expect((await listOf("bea"))[0]?.spaces?.map((unit) => unit.name)).toEqual(["Ana garage"]);
    });

    it("never names to a person a chosen space they can no longer see", async () => {
      await issue("bea", "beas-attic", "read", ["Ana attic"]);
      const bea = await api.database.client.user.findUnique({ where: { username: "bea" } });
      await api.database.client.share.delete({
        where: {
          storageUnitId_userId: { storageUnitId: idOf("Ana attic"), userId: bea?.id ?? "" },
        },
      });

      const listed = await as("bea", { method: "GET", url: "/auth/machine-tokens" });

      expect(listed.body).not.toContain("Ana attic");
      expect((listed.json() as { machineTokens: ListedToken[] }).machineTokens[0]?.spaces).toEqual([]);
    });

    const create = (person: Person, name: string) =>
      as(person, { method: "POST", url: "/auth/machine-tokens", payload: { name, scope: "read" } });
  });
});
