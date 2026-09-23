import { anItem, aSession, withPhoto } from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { box, drill, garage, theApiKnowsTheHouse, wardrobe } from "../testing/the-house.js";

/**
 * # Emptying a box without opening forty screens
 *
 * `POST /items/move` has always taken a LIST (ADR 3) and this app has always
 * sent it one item at a time. The web client grew a tick box beside every row
 * and a bar underneath; a phone has no room for a permanent column of tick
 * boxes beside a grid of photographs three across, so the same capability
 * arrives as a MODE.
 *
 * Holding a thing down starts it, which is what a long press means on this
 * platform for every list Android has ever shipped. That gesture is invisible,
 * so it is not the only way in: the box's own actions carry a button that says
 * so in words, and the bar that appears says the gesture out loud for next
 * time.
 *
 * While it is on, a tap TICKS rather than opens. That is the whole reason the
 * mode exists — a card cannot be both the way into a thing and the tick box
 * beside it — and it is why leaving the mode is one tap away at all times.
 */
const saw = anItem({ id: "saw", storageUnitId: "box3", name: "Hand saw" });

const atBox3 = { name: "Unit", params: { id: "box3" } } as const;

const theBoxHoldsTwoThings = (): void => {
  apiServer.use(
    http.get(`${API_URL}/storage-units/box3`, () =>
      HttpResponse.json({
        unit: withPhoto(box),
        path: [garage, wardrobe, box],
        children: [],
        items: [drill, saw],
      }),
    ),
  );
};

/** Answers the move, and remembers exactly what was asked of it. */
const theApiTakesAMove = (): readonly unknown[] => {
  const asked: unknown[] = [];

  apiServer.use(
    http.post(`${API_URL}/items/move`, async ({ request }) => {
      asked.push(await request.json());

      return HttpResponse.json({
        items: [
          anItem({ id: "drill", storageUnitId: "garage" }),
          anItem({ id: "saw", storageUnitId: "garage" }),
        ],
      });
    }),
  );

  return asked;
};

describe("picking several things at once", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
    theBoxHoldsTwoThings();
  });

  describe("starting", () => {
    it("holds a thing down to start picking, with that thing already picked", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");

      expect(
        await screen.findByRole("checkbox", { name: "Select Cordless drill" }),
      ).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Move 1 item" })).toBeOnTheScreen();
    });

    /**
     * A gesture nobody can see is not a feature. The box's own actions say it
     * in words, which is what makes this reachable by somebody who has never
     * held a card down in their life.
     */
    it("also starts from a button, for anybody who does not know the gesture", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent.press(
        await screen.findByRole("button", { name: "More actions for Box 3" }),
      );
      await fireEvent.press(await screen.findByRole("button", { name: "Select several" }));

      expect(
        await screen.findByRole("checkbox", { name: "Select Cordless drill" }),
      ).toBeOnTheScreen();
      expect(screen.getByRole("checkbox", { name: "Select Hand saw" })).toBeOnTheScreen();
    });

    it("says how picking works, so the gesture is learnable", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent.press(
        await screen.findByRole("button", { name: "More actions for Box 3" }),
      );
      await fireEvent.press(await screen.findByRole("button", { name: "Select several" }));

      expect(await screen.findByText(/holding one down/i)).toBeOnTheScreen();
    });
  });

  describe("while picking", () => {
    it("ticks a thing rather than opening it", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent.press(
        await screen.findByRole("button", { name: "More actions for Box 3" }),
      );
      await fireEvent.press(await screen.findByRole("button", { name: "Select several" }));
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Hand saw" }));

      expect(screen.getByRole("button", { name: "Move 1 item" })).toBeOnTheScreen();
      // Still in the box, not on the saw's own screen.
      expect(screen.getByRole("header", { name: "Box 3" })).toBeOnTheScreen();
    });

    it("counts everything that has been ticked", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Hand saw" }));

      expect(screen.getByRole("button", { name: "Move 2 items" })).toBeOnTheScreen();
    });

    it("unticks a thing that was ticked by mistake", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Hand saw" }));
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Hand saw" }));

      expect(screen.getByRole("button", { name: "Move 1 item" })).toBeOnTheScreen();
    });

    /**
     * Unticking the last one must NOT quietly hand the tap back to opening
     * things: somebody halfway through choosing would open a screen they did
     * not ask for. Leaving is a deliberate act.
     */
    it("stays in picking when the last thing is unticked", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Cordless drill" }));

      expect(
        screen.getByRole("checkbox", { name: "Select Cordless drill" }),
      ).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Move 1 item" })).toBeNull();
    });

    it("gives the cards back as ways in when the selection is cleared", async () => {
      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");
      await fireEvent.press(screen.getByRole("button", { name: "Clear selection" }));

      expect(await screen.findByRole("link", { name: "Cordless drill" })).toBeOnTheScreen();
      expect(screen.queryByRole("checkbox", { name: "Select Cordless drill" })).toBeNull();
    });
  });

  describe("moving what was picked", () => {
    it("sends every picked thing in one request", async () => {
      const asked = theApiTakesAMove();

      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Hand saw" }));
      await fireEvent.press(screen.getByRole("button", { name: "Move 2 items" }));

      await fireEvent.press(await screen.findByRole("radio", { name: "Garage" }));
      await fireEvent.press(screen.getByRole("button", { name: "Move them" }));

      await waitFor(() => {
        expect(asked).toEqual([{ itemIds: ["drill", "saw"], targetUnitId: "garage" }]);
      });
    });

    it("puts the cards back once they have gone", async () => {
      theApiTakesAMove();

      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");
      await fireEvent.press(screen.getByRole("button", { name: "Move 1 item" }));

      await fireEvent.press(await screen.findByRole("radio", { name: "Garage" }));
      await fireEvent.press(screen.getByRole("button", { name: "Move them" }));

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Move 1 item" })).toBeNull();
      });
    });

    /**
     * A batch is all or nothing (ADR 3). A refusal has to say that NOTHING
     * moved, or the safe behaviour reads as a partial one — and the selection
     * has to survive, because it is what somebody would otherwise rebuild by
     * hand.
     */
    it("says nothing was moved when the batch was refused, and keeps the selection", async () => {
      apiServer.use(
        http.post(`${API_URL}/items/move`, () =>
          HttpResponse.json(
            {
              error: {
                code: "STORAGE_UNIT_NOT_FOUND",
                message: "storage unit garage does not exist",
                details: { storageUnitId: "garage" },
              },
            },
            { status: 422 },
          ),
        ),
      );

      await renderApp({ session: aSession(), screen: atBox3 });

      await fireEvent(await screen.findByRole("link", { name: "Cordless drill" }), "longPress");
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Hand saw" }));
      await fireEvent.press(screen.getByRole("button", { name: "Move 2 items" }));

      await fireEvent.press(await screen.findByRole("radio", { name: "Garage" }));
      await fireEvent.press(screen.getByRole("button", { name: "Move them" }));

      expect(await screen.findByText(/nothing was moved/i)).toBeOnTheScreen();

      // The sheet is a modal, so the bar behind it is out of reach until it
      // is closed — which is exactly how somebody would find out whether
      // their selection survived.
      await fireEvent.press(screen.getByRole("button", { name: "Close" }));

      expect(
        await screen.findByRole("button", { name: "Move 2 items" }),
      ).toBeOnTheScreen();
    });
  });

  /**
   * Everything you own is the other list of things, and the same box of
   * screws is as likely to be picked from there as from inside a box.
   */
  describe("on everything you own", () => {
    it("picks and moves from the flat list too", async () => {
      const asked = theApiTakesAMove();
      apiServer.use(
        http.get(`${API_URL}/items`, () =>
          HttpResponse.json({
            items: [
              { item: drill, path: [garage, wardrobe, box], location: "Garage > Metal wardrobe > Box 3" },
              { item: saw, path: [garage, wardrobe, box], location: "Garage > Metal wardrobe > Box 3" },
            ],
          }),
        ),
      );

      await renderApp({ session: aSession() });

      await screen.findByText(/scan a label/i);
      await fireEvent.press(screen.getByRole("button", { name: "Things" }));

      await fireEvent(
        await screen.findByRole("link", {
          name: "Cordless drill, Garage > Metal wardrobe > Box 3",
        }),
        "longPress",
      );
      await fireEvent.press(screen.getByRole("checkbox", { name: "Select Hand saw" }));
      await fireEvent.press(screen.getByRole("button", { name: "Move 2 items" }));

      await fireEvent.press(await screen.findByRole("radio", { name: "Garage" }));
      await fireEvent.press(screen.getByRole("button", { name: "Move them" }));

      await waitFor(() => {
        expect(asked).toEqual([{ itemIds: ["drill", "saw"], targetUnitId: "garage" }]);
      });
    });
  });

  describe("in Spanish", () => {
    it("counts and moves in the language on screen", async () => {
      await renderApp({ session: aSession(), screen: atBox3, language: "es" });

      await fireEvent(
        await screen.findByRole("link", { name: "Cordless drill" }),
        "longPress",
      );
      await fireEvent.press(screen.getByRole("checkbox", { name: "Seleccionar Hand saw" }));

      expect(screen.getByRole("button", { name: "Mover 2 cosas" })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole("button", { name: "Mover 2 cosas" }));

      expect(await screen.findByRole("button", { name: "Moverlas" })).toBeOnTheScreen();
    });
  });
});
