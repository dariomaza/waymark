import { ShareLevel, StorageUnitKind } from "@waymark/domain";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MachineTokenScope } from "../auth/machine-token.js";
import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

interface TreeNode {
  readonly id: string;
  readonly name: string;
  readonly permissions: {
    readonly access: string;
    readonly mayMove: boolean;
    readonly mayMoveToTop: boolean;
  };
  readonly owner: { readonly id: string; readonly username: string } | null;
  readonly shared: boolean;
  readonly children: readonly TreeNode[];
}

interface TreeResponse {
  readonly tree: readonly TreeNode[];
  readonly mayMakeRoot: boolean;
}

type Person = "admin" | "ana" | "bea";

const flatten = (nodes: readonly TreeNode[]): TreeNode[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children)]);

/**
 * # The tree says what the caller may do, so a client never offers a refusal
 *
 * Ana's house holds a garage, which holds a shelf, which holds a box, and an
 * attic. Bea may view the garage, edit the shelf inside it and edit the attic.
 * Bea has a flat of her own. Dario made the first account, so he is the
 * administrator (ADR 26).
 */
describe("what the tree tells each person they may do (ADR 26)", () => {
  let api: TestApi;
  const tokens = new Map<Person, string>();
  const ids = new Map<string, string>();

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

  const space = async (person: Person, name: string, parent: string | null = null) => {
    const response = await as(person, {
      method: "POST",
      url: "/storage-units",
      payload: {
        name,
        kind: StorageUnitKind.BOX,
        parentId: parent === null ? null : ids.get(parent),
      },
    });
    expect(response.statusCode).toBe(201);
    ids.set(name, (response.json() as { unit: { id: string } }).unit.id);
  };

  const idOf = (name: string): string => ids.get(name) ?? "";

  beforeEach(async () => {
    await api.reset();
    ids.clear();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    await api.createUser("ana", "anas-password");
    await api.createUser("bea", "beas-password");
    tokens.set("admin", await api.login());
    tokens.set("ana", await api.login("ana", "anas-password"));
    tokens.set("bea", await api.login("bea", "beas-password"));

    await space("ana", "House");
    await space("ana", "Garage", "House");
    await space("ana", "Shelf", "Garage");
    await space("ana", "Box", "Shelf");
    await space("ana", "Attic", "House");
    await space("bea", "Flat");
    await space("admin", "Office");

    await api.share(idOf("Garage"), "bea", ShareLevel.VIEW);
    await api.share(idOf("Shelf"), "bea", ShareLevel.EDIT);
    await api.share(idOf("Attic"), "bea", ShareLevel.EDIT);
  });

  const treeOf = async (person: Person): Promise<TreeResponse> => {
    const response = await as(person, { method: "GET", url: "/storage-units" });
    expect(response.statusCode).toBe(200);

    return response.json() as TreeResponse;
  };

  const nodeIn = (tree: TreeResponse, name: string): TreeNode => {
    const node = flatten(tree.tree).find((candidate) => candidate.name === name);
    if (node === undefined) {
      throw new Error(`"${name}" is not in the tree`);
    }

    return node;
  };

  describe("a person's level on each space", () => {
    it("is view on a space shared to view and edit on one shared to edit inside it", async () => {
      const tree = await treeOf("bea");

      expect(nodeIn(tree, "Garage").permissions.access).toBe("view");
      expect(nodeIn(tree, "Shelf").permissions.access).toBe("edit");
      expect(nodeIn(tree, "Box").permissions.access).toBe("edit");
      expect(nodeIn(tree, "Attic").permissions.access).toBe("edit");
      expect(nodeIn(tree, "Flat").permissions.access).toBe("edit");
    });

    it("is edit everywhere for the owner and for an administrator", async () => {
      for (const person of ["ana", "admin"] as const) {
        const tree = await treeOf(person);
        expect(
          flatten(tree.tree)
            .filter((node) => ["House", "Garage", "Shelf", "Box", "Attic"].includes(node.name))
            .map((node) => node.permissions.access),
        ).toEqual(["edit", "edit", "edit", "edit", "edit"]);
      }
    });
  });

  describe("whether a space may move, and become a top-level one", () => {
    it("tells the owner they may take a space inside their tree to the top", async () => {
      const box = nodeIn(await treeOf("ana"), "Box");

      expect(box.permissions).toEqual({ access: "edit", mayMove: true, mayMoveToTop: true });
    });

    it("tells somebody with an edit share they may move it, but never to the top", async () => {
      const box = nodeIn(await treeOf("bea"), "Box");

      expect(box.permissions).toEqual({ access: "edit", mayMove: true, mayMoveToTop: false });
    });

    it("tells somebody nothing in a view-only space may move", async () => {
      expect(nodeIn(await treeOf("bea"), "Garage").permissions.mayMove).toBe(false);
    });

    it("tells somebody a shared space at their top may not leave it, which is the owner's to do", async () => {
      expect(nodeIn(await treeOf("bea"), "Attic").permissions.mayMove).toBe(false);
    });

    it("agrees with the API: what it offers is accepted, and what it withholds is refused", async () => {
      const tree = await treeOf("bea");
      expect(nodeIn(tree, "Box").permissions.mayMoveToTop).toBe(false);

      const toTop = await as("bea", {
        method: "POST",
        url: `/storage-units/${idOf("Box")}/move`,
        payload: { parentId: null },
      });
      expect(toTop.statusCode).toBe(403);

      const toAttic = await as("bea", {
        method: "POST",
        url: `/storage-units/${idOf("Box")}/move`,
        payload: { parentId: idOf("Attic") },
      });
      expect(toAttic.statusCode).toBe(200);
    });

    it("says whether the caller may make a new top-level space at all", async () => {
      expect((await treeOf("bea")).mayMakeRoot).toBe(true);

      // Narrowed the way the token screen does it, to the garage only.
      const issued = await as("ana", {
        method: "POST",
        url: "/auth/machine-tokens",
        payload: { name: "garage-only", scope: MachineTokenScope.Read, spaceIds: [idOf("Garage")] },
      });
      expect(issued.statusCode).toBe(201);

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders((issued.json() as { token: string }).token),
      });
      expect((response.json() as TreeResponse).mayMakeRoot).toBe(false);
    });
  });

  describe("whose each space is", () => {
    it("names the owner of every root for an administrator", async () => {
      const tree = await treeOf("admin");

      expect(
        tree.tree.map((root) => [root.name, root.owner?.username, root.shared]),
      ).toEqual([
        ["Flat", "bea", false],
        ["House", "ana", false],
        ["Office", TEST_USERNAME, false],
      ]);
    });

    it("never names anybody to a person, and marks what was shared with them", async () => {
      const tree = await treeOf("bea");

      expect(tree.tree.map((root) => [root.name, root.owner, root.shared])).toEqual([
        ["Attic", null, true],
        ["Flat", null, false],
        ["Garage", null, true],
      ]);
      expect(JSON.stringify(tree)).not.toContain('"ana"');
    });
  });
});
