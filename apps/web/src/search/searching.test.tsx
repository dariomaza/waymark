import { SearchMatchField } from "@ariadna/domain";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, anItemHit, aSession, aStorageUnit, aUnitHit } from "@ariadna/api-client/testing";
import type { SearchResponse } from "@ariadna/api-client";

import { renderApp, screen, userEvent, within } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const wardrobe = aStorageUnit({
  id: "wardrobe",
  parentId: "garage",
  name: "Metal wardrobe",
  kind: "FURNITURE",
});
const box = aStorageUnit({ id: "box3", parentId: "wardrobe", name: "Box 3" });
const cableBox = aStorageUnit({ id: "cables", parentId: "garage", name: "Caja de cables" });

const hdmi = anItem({
  id: "hdmi",
  storageUnitId: "box3",
  name: "HDMI 2.1",
  tags: ["cables"],
});

const answersSearchWith = (
  handler: (params: URLSearchParams) => SearchResponse,
): URLSearchParams[] => {
  const asked: URLSearchParams[] = [];
  apiServer.use(
    http.get(`${API_URL}/search`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      asked.push(params);

      return HttpResponse.json(handler(params));
    }),
  );

  return asked;
};

describe("searching for where something is", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
    );
  });

  it("answers with the thing AND where it is", async () => {
    answersSearchWith(() => ({
      query: "cab",
      terms: ["cab"],
      items: [anItemHit(hdmi, [garage, wardrobe, box], [SearchMatchField.TAG])],
      storageUnits: [],
    }));

    renderApp({ route: "/find" });
    await userEvent.type(
      await screen.findByRole("searchbox", { name: /search/i }),
      "cab",
    );

    const hit = await screen.findByRole("article", { name: /HDMI 2\.1/i });
    expect(within(hit).getByText("Garage > Metal wardrobe > Box 3")).toBeVisible();
  });

  it("says WHY a result is there, since the name may not say it", async () => {
    answersSearchWith(() => ({
      query: "cab",
      terms: ["cab"],
      items: [anItemHit(hdmi, [garage, wardrobe, box], [SearchMatchField.TAG])],
      storageUnits: [],
    }));

    renderApp({ route: "/find" });
    await userEvent.type(
      await screen.findByRole("searchbox", { name: /search/i }),
      "cab",
    );

    const hit = await screen.findByRole("article", { name: /HDMI 2\.1/i });
    expect(within(hit).getByText(/tag/i)).toBeVisible();
  });

  it("keeps items and storage units in two lists, because they answer two questions", async () => {
    answersSearchWith(() => ({
      query: "cab",
      terms: ["cab"],
      items: [anItemHit(hdmi, [garage, wardrobe, box], [SearchMatchField.TAG])],
      storageUnits: [aUnitHit(cableBox, [garage, cableBox])],
    }));

    renderApp({ route: "/find" });
    await userEvent.type(
      await screen.findByRole("searchbox", { name: /search/i }),
      "cab",
    );

    const items = await screen.findByRole("list", { name: /^items/i });
    const units = screen.getByRole("list", { name: /storage units/i });
    expect(within(items).getByText("HDMI 2.1")).toBeVisible();
    expect(within(units).getByText("Caja de cables")).toBeVisible();
  });

  it("asks the API nothing at all until something has been typed", async () => {
    renderApp({ route: "/find" });

    expect(await screen.findByText(/type what you are looking for/i)).toBeVisible();
  });

  it("says nothing matched, and repeats what was asked", async () => {
    answersSearchWith(() => ({
      query: "zzz",
      terms: ["zzz"],
      items: [],
      storageUnits: [],
    }));

    renderApp({ route: "/find" });
    await userEvent.type(
      await screen.findByRole("searchbox", { name: /search/i }),
      "zzz",
    );

    expect(await screen.findByText(/nothing matches “zzz”/i)).toBeVisible();
  });

  it("carries the query in the URL, so a search is a link somebody can send", async () => {
    const asked = answersSearchWith(() => ({
      query: "cable",
      terms: ["cable"],
      items: [anItemHit(hdmi, [garage, wardrobe, box])],
      storageUnits: [],
    }));

    renderApp({ route: "/find?q=cable" });

    expect(await screen.findByRole("article", { name: /HDMI 2\.1/i })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: /search/i })).toHaveValue("cable");
    expect(asked.map((params) => params.get("q"))).toEqual(["cable"]);
  });

  it("can be held to one part of the house, and let back out of it", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: [{ ...garage, children: [] }] }),
      ),
    );
    const asked = answersSearchWith(() => ({
      query: "cable",
      terms: ["cable"],
      items: [anItemHit(hdmi, [garage, wardrobe, box])],
      storageUnits: [],
    }));

    renderApp({ route: "/find?q=cable&within=garage" });

    expect(await screen.findByText(/inside garage/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /search everywhere/i }));

    await screen.findByRole("article", { name: /HDMI 2\.1/i });
    expect(asked.map((params) => params.get("within"))).toEqual(["garage", null]);
  });
});
