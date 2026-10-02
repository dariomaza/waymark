import {
  anItem,
  aPhoto,
  aSession,
  aStorageUnit,
  aTree,
  VIEW_ONLY,
  withPhoto,
} from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor, within } from "../testing/render-app.js";
import { theSheetCalled } from "../testing/the-sheet.js";

/**
 * # A space shared to look at offers nothing that would change it (ADR 26)
 *
 * The API refuses every change inside a view-only space; the phone does not
 * offer one, so nobody is shown a button whose only answer is "no". Looking
 * stays: searching inside, the label, the photographs.
 *
 * The partner owns the garage and was shown the attic, view only. The same
 * house, and the same claims, as the browser's test of the same name.
 */

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const shelf = aStorageUnit({ id: "shelf", parentId: "garage", name: "Shelf" });
const attic = aStorageUnit({ id: "attic", name: "Attic", kind: "ROOM" });
const trunk = aStorageUnit({ id: "trunk", parentId: "attic", name: "Trunk" });
const lamp = anItem({
  id: "lamp",
  storageUnitId: "attic",
  name: "Lamp",
  photos: [aPhoto({ id: "p2" }), aPhoto({ id: "p3" })],
});
const drill = anItem({ id: "drill", storageUnitId: "shelf", name: "Drill" });

const ALL_BUT_THE_TOP = { access: "edit", mayMove: true, mayMoveToTop: false } as const;

const theHouse = ({
  mayMakeRoot = true,
  shelfPermissions,
}: {
  readonly mayMakeRoot?: boolean;
  readonly shelfPermissions?: typeof ALL_BUT_THE_TOP;
} = {}): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u2", username: "partner", role: "user" } }),
    ),
    http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({
        tree: [
          aTree(garage, [
            aTree(shelf, [], shelfPermissions === undefined ? {} : { permissions: shelfPermissions }),
          ]),
          aTree(attic, [aTree(trunk, [], { permissions: VIEW_ONLY })], {
            permissions: VIEW_ONLY,
            shared: true,
          }),
        ],
        mayMakeRoot,
      }),
    ),
    http.get(`${API_URL}/storage-units/attic`, () =>
      HttpResponse.json({
        unit: withPhoto(attic, "p1"),
        path: [attic],
        children: [trunk],
        items: [lamp],
      }),
    ),
    http.get(`${API_URL}/storage-units/garage`, () =>
      HttpResponse.json({ unit: withPhoto(garage), path: [garage], children: [shelf], items: [] }),
    ),
    http.get(`${API_URL}/storage-units/shelf`, () =>
      HttpResponse.json({
        unit: withPhoto(shelf),
        path: [garage, shelf],
        children: [],
        items: [drill],
      }),
    ),
    http.get(`${API_URL}/items/lamp`, () =>
      HttpResponse.json({ item: lamp, storageUnit: attic, path: [attic] }),
    ),
    http.get(`${API_URL}/items/drill`, () =>
      HttpResponse.json({ item: drill, storageUnit: shelf, path: [garage, shelf] }),
    ),
    http.get(`${API_URL}/items`, () =>
      HttpResponse.json({
        items: [
          { item: drill, path: [garage, shelf], location: "Garage > Shelf" },
          { item: lamp, path: [attic], location: "Attic" },
        ],
      }),
    ),
  );
};

const at = (name: string, id: string) => ({ name, params: { id } }) as const;

const openTheMenuFor = async (name: string): Promise<ReturnType<typeof within>> => {
  await fireEvent.press(await screen.findByRole("button", { name: `More actions for ${name}` }));

  return await theSheetCalled(`More actions for ${name}`);
};

const thePicker = async (label: string): Promise<ReturnType<typeof within>> =>
  within(await screen.findByLabelText(label));

describe("a space shared to look at", () => {
  it("says it is view only, under its name", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "attic") });

    expect(await screen.findByText("View only")).toBeOnTheScreen();
  });

  it("does not say so of a space the person may change", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "shelf") });

    await screen.findByRole("button", { name: "Add an item" });
    expect(screen.queryByText("View only")).toBeNull();
  });

  it("offers searching inside it, and not adding an item to it", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "attic") });

    expect(await screen.findByRole("button", { name: "Search inside" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add an item" })).toBeNull();
  });

  it("keeps its label in its menu, and nothing that would change it", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "attic") });

    const menu = await openTheMenuFor("Attic");

    expect(menu.getByRole("button", { name: "Show the label" })).toBeOnTheScreen();
    for (const act of ["Select several", "Add a space inside", "Edit", "Move", "Empty", "Delete"]) {
      expect(menu.queryByRole("button", { name: act })).toBeNull();
    }
  });

  it("shows its photo without offering to replace or remove it", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "attic") });

    expect(await screen.findByLabelText("Photo of Attic")).toBeOnTheScreen();
    for (const act of ["Take a photo", "Choose a photo", "Remove this photo"]) {
      expect(screen.queryByRole("button", { name: act })).toBeNull();
    }
  });

  it("does not let the things in it be picked for moving", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "attic") });

    await fireEvent(await screen.findByRole("link", { name: "Lamp" }), "longPress");

    expect(screen.queryByRole("checkbox", { name: "Select Lamp" })).toBeNull();
  });

  it("lets a thing in it be looked at, and not edited, moved or deleted", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Item", "lamp") });

    await screen.findByText("Lamp");
    await screen.findByLabelText("Cover photo of Lamp");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions for Lamp" })).toBeNull();
  });

  it("shows a thing's photos without offering to add, reorder or delete them", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Item", "lamp") });

    const gallery = within(await screen.findByLabelText("Photos"));
    expect(gallery.getByLabelText("Cover photo of Lamp")).toBeOnTheScreen();
    expect(gallery.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Take a photo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose a photo" })).toBeNull();
  });

  it("is left out of picking on everything you own, while the rest still picks", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: { name: "Tabs", params: { screen: "Items" } } });

    await fireEvent(await screen.findByRole("link", { name: "Lamp, Attic" }), "longPress");
    expect(screen.queryByRole("checkbox", { name: "Select Lamp" })).toBeNull();

    await fireEvent(screen.getByRole("link", { name: "Drill, Garage > Shelf" }), "longPress");
    expect(await screen.findByRole("checkbox", { name: "Select Drill" })).toBeOnTheScreen();
    expect(screen.queryByRole("checkbox", { name: "Select Lamp" })).toBeNull();
  });
});

describe("where something may be put", () => {
  it("lists only the spaces the person may change when moving a space", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "shelf") });

    const menu = await openTheMenuFor("Shelf");
    await fireEvent.press(menu.getByRole("button", { name: "Move" }));
    const picker = await thePicker("Move it into");

    await waitFor(() => {
      expect(picker.getByRole("radio", { name: "Garage" })).toBeOnTheScreen();
    });
    expect(picker.queryByRole("radio", { name: /Attic/ })).toBeNull();
    expect(picker.getByRole("radio", { name: "Nowhere — make it a root" })).toBeOnTheScreen();
  });

  it("does not offer the top level when the space may not go there", async () => {
    theHouse({ shelfPermissions: ALL_BUT_THE_TOP });
    await renderApp({ session: aSession(), screen: at("Unit", "shelf") });

    const menu = await openTheMenuFor("Shelf");
    await fireEvent.press(menu.getByRole("button", { name: "Move" }));
    const picker = await thePicker("Move it into");

    await waitFor(() => {
      expect(picker.getByRole("radio", { name: "Garage" })).toBeOnTheScreen();
    });
    expect(picker.queryByRole("radio", { name: "Nowhere — make it a root" })).toBeNull();
  });

  it("lists only the spaces the person may change when moving a thing", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Item", "drill") });

    await fireEvent.press(await screen.findByRole("button", { name: "Move" }));
    const picker = await thePicker("Move it into");

    await waitFor(() => {
      expect(picker.getByRole("radio", { name: "Garage > Shelf" })).toBeOnTheScreen();
    });
    expect(picker.queryByRole("radio", { name: /Attic/ })).toBeNull();
  });

  it("lists only the spaces the person may change when moving several things", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "shelf") });

    await fireEvent(await screen.findByRole("link", { name: "Drill" }), "longPress");
    await fireEvent.press(screen.getByRole("button", { name: "Move 1 item" }));
    const picker = await thePicker("Move them into");

    await waitFor(() => {
      expect(picker.getByRole("radio", { name: "Garage" })).toBeOnTheScreen();
    });
    expect(picker.queryByRole("radio", { name: /Attic/ })).toBeNull();
  });

  it("lists only the spaces the person may change when emptying a space", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: at("Unit", "garage") });

    const menu = await openTheMenuFor("Garage");
    await fireEvent.press(menu.getByRole("button", { name: "Empty" }));
    const picker = await thePicker("Move everything into");

    await waitFor(() => {
      expect(picker.getByRole("radio", { name: "Garage > Shelf" })).toBeOnTheScreen();
    });
    expect(picker.queryByRole("radio", { name: /Attic/ })).toBeNull();
  });

  it("does not offer a new top-level space when none may be made", async () => {
    theHouse({ mayMakeRoot: false });
    await renderApp({ session: aSession(), screen: { name: "Tabs", params: { screen: "Inventory" } } });

    await screen.findByRole("link", { name: /Garage/ });
    expect(screen.queryByRole("button", { name: "Add a space" })).toBeNull();
    expect(screen.getByRole("button", { name: "Label sheet" })).toBeOnTheScreen();
  });

  it("offers a new top-level space when one may be made", async () => {
    theHouse();
    await renderApp({ session: aSession(), screen: { name: "Tabs", params: { screen: "Inventory" } } });

    expect(await screen.findByRole("button", { name: "Add a space" })).toBeOnTheScreen();
  });
});
