import { ApiError, OFFLINE_STATUS } from "@waymark/api-client";
import { describe, expect, it } from "vitest";

import {
  cyclicMoveMessage,
  describeFailure,
  fieldComplaints,
  loginFailureMessage,
  missingTargetMessage,
  moveRefusedMessage,
  notEmptyMessage,
  tooManyPhotosMessage,
} from "./refusals.js";
import { translator } from "./translate.js";

const en = translator("en");
const es = translator("es");

const notEmpty = (items: number, units: number): ApiError =>
  new ApiError(409, "STORAGE_UNIT_NOT_EMPTY", "storage unit is not empty", {
    itemCount: items,
    childUnitCount: units,
  });

/**
 * # A refusal decided once, said in two languages
 *
 * These functions used to return finished English sentences from
 * `@waymark/api-client`. They return a `Message` now — the key and the
 * numbers — because WHICH refusal happened is a fact about the API and has
 * nothing to do with what is on screen, while the words are the opposite.
 *
 * Every one of them stays `null` for a failure it has no answer for, so a
 * screen can tell the one refusal it handles from every other.
 */
describe("a box that will not delete because it is not empty", () => {
  it("counts what is still inside, in English", () => {
    expect(en(notEmptyMessage(notEmpty(2, 1), "Garage"))).toBe(
      "Garage still holds 2 items and 1 unit. Nothing is deleted with a box still full.",
    );
  });

  /**
   * The sentence the whole exercise is for. Two counts in one sentence, each
   * agreeing with its own noun, joined by a word that is not "and".
   */
  it("counts what is still inside, in Spanish", () => {
    expect(es(notEmptyMessage(notEmpty(2, 1), "Garaje"))).toBe(
      "Garaje todavía contiene 2 cosas y 1 unidad. No se borra una caja que sigue llena.",
    );
  });

  it("says only the part that is not zero", () => {
    expect(en(notEmptyMessage(notEmpty(1, 0), "Garage"))).toContain("holds 1 item.");
    expect(en(notEmptyMessage(notEmpty(0, 3), "Garage"))).toContain("holds 3 units.");
    expect(es(notEmptyMessage(notEmpty(1, 0), "Garaje"))).toContain("contiene 1 cosa.");
    expect(es(notEmptyMessage(notEmpty(0, 3), "Garaje"))).toContain("contiene 3 unidades.");
  });

  /** Each count picks its own plural form: one of these and several of those. */
  it("counts each noun on its own", () => {
    expect(en(notEmptyMessage(notEmpty(1, 2), "Garage"))).toContain("1 item and 2 units");
    expect(es(notEmptyMessage(notEmpty(1, 2), "Garaje"))).toContain("1 cosa y 2 unidades");
  });

  it("keeps quiet about a refusal it is not the answer to", () => {
    expect(notEmptyMessage(new ApiError(404, "NOT_FOUND", "gone"), "Garage")).toBeNull();
    expect(notEmptyMessage(new Error("boom"), "Garage")).toBeNull();
  });

  /**
   * A name is typed by a person and goes into the sentence as text, never as
   * another hole to be filled. See `fill` in `phrase.ts`.
   */
  it("prints a name that looks like a template", () => {
    expect(en(notEmptyMessage(notEmpty(1, 0), "{count}"))).toContain("{count} still holds 1 item");
  });
});

describe("a move the tree cannot take", () => {
  const cyclic = new ApiError(409, "CYCLIC_STORAGE_UNIT_MOVE", "cyclic move");

  it("says so in both languages", () => {
    expect(en(cyclicMoveMessage(cyclic, "Attic"))).toBe(
      "Attic cannot go inside itself, or inside anything already inside it. Pick somewhere outside it.",
    );
    expect(es(cyclicMoveMessage(cyclic, "Desván"))).toBe(
      "Desván no puede ir dentro de sí mismo, ni dentro de nada que ya esté dentro de él. Elija un destino fuera.",
    );
  });

  it("keeps quiet about anything else", () => {
    expect(cyclicMoveMessage(new ApiError(409, "STORAGE_UNIT_NOT_EMPTY", "x"), "Attic")).toBeNull();
  });
});

describe("a root unit with nowhere to empty into", () => {
  it("asks for a destination in both languages", () => {
    const error = new ApiError(409, "MISSING_EMPTY_TARGET", "no target");

    expect(en(missingTargetMessage(error))).toBe(
      "This unit has no parent to empty into. Choose where its contents should go.",
    );
    expect(es(missingTargetMessage(error))).toBe(
      "Esta unidad no tiene una unidad superior donde vaciarse. Elija dónde deben ir sus contenidos.",
    );
  });
});

describe("a move that was refused whole", () => {
  /**
   * A move is all or nothing (ADR 3): one unknown id rejects the whole batch,
   * rather than leaving an inventory half moved. The sentence has to say
   * nothing changed, or the safe behaviour reads as a partial one.
   */
  it("says nothing moved, and why, in both languages", () => {
    const refused = new ApiError(422, "VALIDATION_FAILED", "one of those items is not there");

    expect(en(moveRefusedMessage(refused))).toBe(
      "Nothing was moved. One of those items is not there A move is all or nothing, so the rest stayed where they were.",
    );
    expect(es(moveRefusedMessage(refused))).toContain("No se ha movido nada.");
    expect(es(moveRefusedMessage(refused))).toContain(
      "Un movimiento es todo o nada, así que el resto se ha quedado donde estaba.",
    );
  });

  it("keeps quiet when the move failed for some other reason", () => {
    expect(moveRefusedMessage(new ApiError(500, "SERVER", "boom"))).toBeNull();
  });
});

describe("an item that already holds all the photos it can", () => {
  it("says how many, in both languages", () => {
    const full = new ApiError(409, "TOO_MANY_ITEM_PHOTOS", "too many");

    expect(en(tooManyPhotosMessage(full, 10))).toBe(
      "This item already holds 10 photos. Delete one to make room.",
    );
    expect(es(tooManyPhotosMessage(full, 10))).toBe(
      "Esta cosa ya tiene 10 fotos. Borre una para hacer sitio.",
    );
  });
});

describe("a sign-in that did not work", () => {
  /**
   * "Wrong password" and "cannot reach the server" must never be the same
   * sentence. The first makes you try again more carefully; the second makes
   * you walk towards the router.
   */
  it("tells a wrong password apart from a dead connection", () => {
    const wrong = loginFailureMessage(new ApiError(401, "INVALID_CREDENTIALS", "no"));
    const offline = loginFailureMessage(new ApiError(OFFLINE_STATUS, "OFFLINE", "no"));

    expect(en(wrong)).toBe("That username or password is wrong.");
    expect(en(offline)).toBe("The app could not reach Ariadna. Check the connection and try again.");
    expect(es(wrong)).toBe("El usuario o la contraseña no son correctos.");
    expect(es(offline)).toBe(
      "La aplicación no ha podido conectar con Ariadna. Compruebe la conexión e inténtelo de nuevo.",
    );
  });

  it("says nothing at all when nothing has failed", () => {
    expect(loginFailureMessage(null)).toBeNull();
    expect(loginFailureMessage(undefined)).toBeNull();
  });
});

describe("a failure no screen expected", () => {
  it("keeps the kinds apart rather than saying something went wrong", () => {
    expect(en(describeFailure(new ApiError(404, "NOT_FOUND", "gone")))).toBe(
      "That is not here any more. It may have been deleted or moved.",
    );
    expect(es(describeFailure(new ApiError(404, "NOT_FOUND", "gone")))).toBe(
      "Esto ya no está aquí. Puede que se haya borrado o movido.",
    );
    expect(es(describeFailure(new ApiError(401, "INVALID_SESSION", "gone")))).toBe(
      "La sesión ha terminado. Inicie sesión de nuevo.",
    );
  });

  /**
   * A 409 and a 422 carry a message written about the exact situation, which
   * beats anything this could invent — and that message comes from the API in
   * ENGLISH. It is passed through rather than translated, because inventing a
   * Spanish sentence for a refusal nobody here has seen would be worse than
   * showing the one the server actually sent.
   */
  it("passes the API's own words through, capitalised", () => {
    const refused = new ApiError(409, "SOMETHING_NEW", "that shelf is already gone");

    expect(en(describeFailure(refused))).toBe("That shelf is already gone");
    expect(es(describeFailure(refused))).toBe("That shelf is already gone");
  });

  it("falls back to a sentence of its own for anything that is not an ApiError", () => {
    expect(es(describeFailure(new TypeError("undefined is not a function")))).toBe(
      "Ariadna ha tenido un problema al responder. Inténtelo de nuevo en un momento.",
    );
  });
});

/**
 * The API's own field validation. Its messages are NOT translated: they are
 * written by the request schema about the exact value that was sent, and
 * inventing a second copy of "names are at most 200 characters" here is how
 * the two come to disagree.
 */
describe("the API's complaints about a field", () => {
  it("hands them over as the API wrote them", () => {
    const error = new ApiError(422, "VALIDATION_FAILED", "invalid", {
      issues: [{ path: "name", message: "String must contain at most 200 character(s)" }],
    });

    expect(fieldComplaints(error)).toEqual([
      { field: "name", message: "String must contain at most 200 character(s)" },
    ]);
  });

  it("has nothing to say about any other refusal", () => {
    expect(fieldComplaints(new ApiError(409, "STORAGE_UNIT_NOT_EMPTY", "x"))).toEqual([]);
  });
});
