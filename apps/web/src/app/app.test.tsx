import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./app.js";

describe("the app", () => {
  it("names itself, so a phone home screen has something to show", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toHaveTextContent("Ariadna");
  });
});
