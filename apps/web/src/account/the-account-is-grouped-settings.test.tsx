import { aSession } from "@waymark/api-client/testing";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import type { PasskeyPlatform } from "../auth/passkey-platform.js";
import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { sheet, TOKENS } from "../testing/drawn.js";
import { renderApp, screen, userEvent, within } from "../testing/render-app.js";

/**
 * # The account screen, read as settings rather than as paragraphs
 *
 * The owner, holding the phone one-handed: the language and appearance
 * selectors were ugly and the whole screen was disordered — a lede, a big
 * title, two controls of two different sizes, loose cards, and a full-width
 * word button at the bottom. What he approved is a settings screen: who you
 * are with the way out beside your name, then groups — Preferences, Security,
 * Connected programs — each one card of rows, with its actions as icons in the
 * group's title line.
 *
 * jsdom has no layout, so nothing here can prove alignment or wrapping at a
 * narrow width. What it CAN prove is what the stylesheet gives each element —
 * the stylesheets are put into the document after the app is drawn — and
 * everything a person can do.
 */
const signedIn = (): void => {
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })),
    http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
    http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
  );
};

/** The stylesheets the account screen is drawn with, after the tokens. */
const paint = (...sheets: readonly string[]): void => {
  const style = document.createElement("style");
  style.textContent = [TOKENS, ...sheets.map(sheet)].join("\n");
  document.head.append(style);
};

/** A device that can make a passkey, so the group offers to add one. */
const aPlatform: PasskeyPlatform = {
  isAvailable: async () => true,
  register: async () => ({ id: "credential-1", type: "public-key" }),
  assert: async () => ({ id: "credential-1", type: "public-key" }),
};

const openAccount = async (): Promise<void> => {
  renderApp({ route: "/you", passkeys: aPlatform });
  await screen.findByRole("heading", { name: /^you$/i });
};

/** Two devices and two programs, which is what the owner's screen holds. */
const aFullAccount = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/passkeys`, () =>
      HttpResponse.json({
        passkeys: [
          { id: "pk1", label: "OPPO Find X9", createdAt: "2026-04-01T10:00:00.000Z", lastUsedAt: "2026-09-20T10:00:00.000Z" },
          { id: "pk2", label: "MacBook", createdAt: "2026-04-02T10:00:00.000Z", lastUsedAt: null },
        ],
      }),
    ),
    http.get(`${API_URL}/auth/machine-tokens`, () =>
      HttpResponse.json({
        machineTokens: [
          { id: "mt1", name: "claude-desktop", scope: "read", createdAt: "2026-04-01T10:00:00.000Z", expiresAt: null, lastUsedAt: null },
          { id: "mt2", name: "home-assistant", scope: "read-write", createdAt: "2026-04-01T10:00:00.000Z", expiresAt: null, lastUsedAt: "2026-09-21T10:00:00.000Z" },
        ],
      }),
    ),
  );
};

/** The group a heading titles: the section it heads. */
const groupTitled = (name: string): HTMLElement =>
  screen.getByRole("heading", { name }).closest("section") as HTMLElement;

/** The strip across the top of a group: its title, its ⓘ, its [+]. */
const headOf = (name: string): HTMLElement =>
  screen.getByRole("heading", { name }).parentElement as HTMLElement;

/** The `<label>` a radio is drawn as: the input itself is only the mechanism. */
const drawnAs = (radio: HTMLElement): HTMLElement => radio.closest("label") as HTMLElement;

beforeEach(signedIn);

describe("the two selectors", () => {
  /**
   * The language pill was 31 pixels tall, under the floor every other control
   * in this app keeps, and the appearance row beside it was 48 in a different
   * shape. One control, drawn once, cannot disagree with itself.
   */
  it("are the same control, every answer a target a thumb can hit", async () => {
    await openAccount();
    paint("ui/atoms/segmented.css");

    const answers = [
      ...within(screen.getByRole("group", { name: "Language" })).getAllByRole("radio"),
      ...within(screen.getByRole("group", { name: "Appearance" })).getAllByRole("radio"),
    ];

    expect(answers).toHaveLength(5);
    for (const answer of answers) {
      expect(getComputedStyle(drawnAs(answer)).minHeight).toBe("48px");
      expect(getComputedStyle(drawnAs(answer)).minWidth).toBe("48px");
    }
  });

  it("draws the languages as their two letters and reads them out by name", async () => {
    await openAccount();

    const language = within(screen.getByRole("group", { name: "Language" }));

    expect(language.getByRole("radio", { name: "English" })).toBeChecked();
    expect(language.getByRole("radio", { name: "Español" })).not.toBeChecked();
    expect(language.getByText("EN")).toBeVisible();
    expect(language.getByText("ES")).toBeVisible();
  });

  it("picks a language with one tap on its two letters", async () => {
    await openAccount();

    await userEvent.click(screen.getByText("ES"));

    expect(screen.getByRole("radio", { name: "Español" })).toBeChecked();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeVisible();
  });

  /**
   * Three words in a row were what made the appearance control wider than the
   * language one. The pictures are the answer; the words are what a screen
   * reader says, and they are drawn nowhere.
   */
  it("draws the appearance as pictures, and says each one's name only aloud", async () => {
    await openAccount();
    paint("ui/atoms/segmented.css");

    const appearance = within(screen.getByRole("group", { name: "Appearance" }));

    for (const name of ["System", "Light", "Dark"]) {
      const option = drawnAs(appearance.getByRole("radio", { name }));
      const word = within(option).getByText(name);

      expect(option.querySelector("svg")).not.toBeNull();
      expect(getComputedStyle(word).position).toBe("absolute");
      expect(getComputedStyle(word).width).toBe("1px");
    }
  });

  /**
   * The selectors floated on their own, one under a visible heading and one
   * with its name hidden. Now each is a row: its picture and its name on the
   * left, the control on the right, and the name is what the control is
   * called — written once, read by both the eye and a screen reader.
   */
  it("writes each setting's name beside its control, and calls the control by it", async () => {
    await openAccount();
    paint("ui/molecules/setting-row.css");

    for (const name of ["Language", "Appearance"]) {
      const group = screen.getByRole("group", { name });
      const row = group.closest(".setting-row") as HTMLElement;

      expect(within(row).getByText(name)).toBeVisible();
      expect(row.querySelector(".setting-row__label svg")).not.toBeNull();
      expect(getComputedStyle(row).flexWrap).toBe("wrap");
    }
  });
});

describe("who is signed in", () => {
  it("says the name on its own line, and that it is signed in under it", async () => {
    await openAccount();

    expect(await screen.findByText("dario")).toBeVisible();
    expect(screen.getByText("Signed in")).toBeVisible();
  });

  /**
   * The way out was a full-width word button at the bottom of everything. It
   * is an icon now, beside the name it signs out — named in words for a
   * screen reader, and still the way out.
   */
  it("puts the way out beside the name, as a picture that still says what it does", async () => {
    await openAccount();

    const who = (await screen.findByText("dario")).closest(".account-panel__who") as HTMLElement;
    const out = within(who).getByRole("button", { name: "Sign out" });

    expect(out).toHaveTextContent("");
    expect(out.querySelector("svg")).not.toBeNull();
  });

  it("signs out from that icon", async () => {
    await openAccount();

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: /sign in to waymark/i })).toBeVisible();
  });

  /**
   * The bar already says "You" under the avatar, so the screen does not draw
   * it again in big letters. A screen reader still lands on the heading.
   */
  it("keeps the screen's name for a screen reader without drawing it again", async () => {
    await openAccount();
    paint("account/views/account-panel.css");

    const title = screen.getByRole("heading", { name: "You", level: 2 });
    expect(getComputedStyle(title).position).toBe("absolute");
    expect(getComputedStyle(title).width).toBe("1px");
  });

  it("no longer opens with a sentence about itself", async () => {
    await openAccount();
    await screen.findByText("dario");

    expect(screen.queryByText(/how this app speaks and looks/i)).toBeNull();
  });
});

describe("the groups", () => {
  it("are Preferences, Security and Connected programs, in that order", async () => {
    await openAccount();
    await screen.findByText("dario");

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Preferences", "Security", "Connected programs"]);
  });

  /**
   * One card per group, not a floating card per item: the two devices are
   * rows of the same raised surface, divided by a hairline.
   */
  it("draws each group as one raised card of rows", async () => {
    aFullAccount();
    await openAccount();
    paint("ui/molecules/settings-group.css");

    const phone = await screen.findByText("OPPO Find X9");
    const laptop = screen.getByText("MacBook");
    const card = phone.closest(".settings-group__card");

    expect(card).not.toBeNull();
    expect(laptop.closest(".settings-group__card")).toBe(card);
    expect(getComputedStyle(card as HTMLElement).backgroundColor).toBe(
      "var(--color-surface-raised)",
    );
    expect(
      screen.getByRole("group", { name: "Language" }).closest(".settings-group__card"),
    ).toBe(screen.getByRole("group", { name: "Appearance" }).closest(".settings-group__card"));
  });

  it("names the group each card belongs to in the words on screen", async () => {
    renderApp({ route: "/you", passkeys: aPlatform });
    await userEvent.click(await screen.findByText("ES"));

    expect(await screen.findByRole("heading", { name: "Preferencias" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Seguridad" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Programas conectados" })).toBeVisible();
  });
});

/**
 * Three paragraphs of two or three lines each were most of what made the
 * screen read as a page rather than as settings. Each is one tap away now,
 * behind the ⓘ beside the title of the group it explains.
 */
describe("the explanations", () => {
  it("are folded until the ⓘ beside the group's title is tapped", async () => {
    await openAccount();
    await screen.findByText("dario");

    const about = within(headOf("Security")).getByRole("button", { name: "More about Security" });
    expect(about).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/your face or your screen lock/i)).not.toBeVisible();

    await userEvent.click(about);

    expect(about).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/your face or your screen lock/i)).toBeVisible();
  });

  it("fold the programs' two sentences behind their group's ⓘ too", async () => {
    await openAccount();
    await screen.findByText("dario");

    expect(screen.queryByText(/a key you give to a program/i)).not.toBeVisible();

    await userEvent.click(
      within(headOf("Connected programs")).getByRole("button", {
        name: "More about Connected programs",
      }),
    );

    expect(screen.getByText(/a key you give to a program/i)).toBeVisible();
    expect(screen.getByText(/it is not a secret/i)).toBeVisible();
  });
});

describe("the security group", () => {
  it("adds a device from the [+] in its title line", async () => {
    await openAccount();
    await screen.findByText("dario");

    const add = await within(headOf("Security")).findByRole("button", { name: "Add this device" });
    expect(add).toHaveTextContent("");

    await userEvent.click(add);

    expect(
      within(groupTitled("Security")).getByRole("textbox", { name: /what is this device/i }),
    ).toBeVisible();
  });

  it("gives each device one line of when it was used, and a bin to remove it", async () => {
    aFullAccount();
    await openAccount();

    const phone = (await screen.findByText("OPPO Find X9")).closest("li") as HTMLElement;
    const laptop = screen.getByText("MacBook").closest("li") as HTMLElement;

    expect(within(phone).getByText(/^last used/i)).toBeVisible();
    expect(within(laptop).getByText(/^never used$/i)).toBeVisible();
    expect(within(phone).queryByText(/added/i)).toBeNull();
    expect(within(phone).getByRole("button", { name: "Remove" })).toHaveTextContent("");
  });
});

describe("the connected programs group", () => {
  it("makes a token from the [+] in its title line", async () => {
    await openAccount();
    await screen.findByText("dario");

    const add = within(headOf("Connected programs")).getByRole("button", { name: "New token" });
    expect(add).toHaveTextContent("");

    await userEvent.click(add);

    expect(
      within(groupTitled("Connected programs")).getByRole("textbox", { name: /what is it for/i }),
    ).toBeVisible();
  });

  it("gives the address one row, with its copy control beside it", async () => {
    await openAccount();
    await screen.findByText("dario");

    const address = within(groupTitled("Connected programs")).getByLabelText(
      "The address of this Waymark",
    );
    const row = address.closest(".settings-group__card > *") as HTMLElement;

    expect(within(row).getByRole("button", { name: "Copy the address" })).toBeVisible();
    expect(screen.queryByText("Where to point it")).toBeNull();
  });

  it("gives each token one row: its name, what it may do, and two icons", async () => {
    aFullAccount();
    await openAccount();

    const token = (await screen.findByText("home-assistant")).closest("li") as HTMLElement;

    expect(within(token).getByText("Read and write")).toBeVisible();
    expect(within(token).getByRole("button", { name: "Rotate" })).toHaveTextContent("");
    expect(within(token).getByRole("button", { name: "Revoke" })).toHaveTextContent("");
    expect(within(token).queryByText(/made/i)).toBeNull();
  });
});

