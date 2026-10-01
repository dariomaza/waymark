import { ShareLevel } from "@waymark/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

/**
 * # Whose a space is, end to end (ADR 26)
 *
 * Ownership is written on roots only and follows the tree. These cases drive
 * the real routes into a real database and then read the column itself,
 * because what is being proven is what gets STORED: who the database will say
 * owns a garage when, in a later slice, it is asked who may see it.
 *
 * Nobody is refused anything here: every write below is one its author may
 * make (ADR 26). What may be refused is proven in
 * `what-each-person-may-see.test.ts`; this file is only about who ends up
 * owning what.
 */
describe("whose a space is, over HTTP", () => {
  let api: TestApi;
  let dario: string;
  let partner: string;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    await api.createUser("partner", "another-password");
    dario = await api.login();
    partner = await api.login("partner", "another-password");
  });

  const create = async (
    session: string,
    name: string,
    parentId: string | null = null,
  ): Promise<string> => {
    const response = await api.app.inject({
      method: "POST",
      url: "/storage-units",
      headers: api.authHeaders(session),
      payload: { name, parentId, kind: "BOX" },
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { unit: { id: string } }).unit.id;
  };

  const move = async (session: string, id: string, parentId: string | null) => {
    const response = await api.app.inject({
      method: "POST",
      url: `/storage-units/${id}/move`,
      headers: api.authHeaders(session),
      payload: { parentId },
    });
    expect(response.statusCode).toBe(200);
  };

  /** The username stored as the owner, or `null` when none is stored. */
  const ownerOf = async (id: string): Promise<string | null> => {
    const unit = await api.database.client.storageUnit.findUnique({
      where: { id },
      include: { owner: true },
    });
    return unit?.owner?.username ?? null;
  };

  it("makes a root its creator's", async () => {
    const garage = await create(partner, "Garage");

    expect(await ownerOf(garage)).toBe("partner");
  });

  it("stores no owner on a space made inside another, even by somebody it was shared with", async () => {
    const garage = await create(dario, "Garage");
    await api.share(garage, "partner", ShareLevel.EDIT);
    const shelf = await create(partner, "Shelf", garage);

    expect(await ownerOf(shelf)).toBeNull();
  });

  it("clears the owner of a root moved inside another space", async () => {
    const house = await create(dario, "House");
    const garage = await create(partner, "Garage");

    await move(dario, garage, house);

    expect(await ownerOf(garage)).toBeNull();
  });

  it("keeps the tree's owner on a space taken to the top, even by the administrator", async () => {
    const garage = await create(partner, "Garage");
    const shelf = await create(partner, "Shelf", garage);

    await move(dario, shelf, null);

    expect(await ownerOf(shelf)).toBe("partner");
  });

  it("makes a root created through a machine token its issuer's", async () => {
    const token = await api.createMachineToken(
      "partner-filer",
      "read-write",
      undefined,
      "partner",
    );

    const response = await api.app.inject({
      method: "POST",
      url: "/storage-units",
      headers: api.machineHeaders(token),
      payload: { name: "Shed", kind: "ROOM" },
    });

    expect(response.statusCode).toBe(201);
    const shed = (response.json() as { unit: { id: string } }).unit.id;
    expect(await ownerOf(shed)).toBe("partner");
  });
});
