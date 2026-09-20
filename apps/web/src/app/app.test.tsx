import { describe, expect, it } from "vitest";

import { renderApp, screen } from "../testing/render-app.js";

describe("the route table", () => {
  it("answers an address that means nothing without asking anybody to sign in", async () => {
    renderApp({ route: "/somewhere-that-never-existed" });

    expect(
      await screen.findByRole("heading", { name: /nothing at this address/i }),
    ).toBeVisible();
  });
});
