import { ApiError, OFFLINE_STATUS } from "@waymark/api-client";
import { describe, expect, it } from "vitest";

import {
  cyclicMoveMessage,
  describeFailure,
  fieldComplaints,
  loginFailureMessage,
  machineTokenFailureMessage,
  missingTargetMessage,
  moveRefusedMessage,
  notEmptyMessage,
  passkeyCeremonyFailureMessage,
  passkeyFailureMessage,
  photoReadFailureMessage,
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
      "Desván no puede ir dentro de sí mismo, ni dentro de nada que ya esté dentro de él. Elige un destino fuera.",
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
      "Esta unidad no tiene una unidad superior donde vaciarse. Elige dónde deben ir sus contenidos.",
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
      "Esta cosa ya tiene 10 fotos. Borra una para hacer sitio.",
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
    expect(en(offline)).toBe("The app could not reach Waymark. Check the connection and try again.");
    expect(es(wrong)).toBe("El usuario o la contraseña no son correctos.");
    expect(es(offline)).toBe(
      "La aplicación no ha podido conectar con Waymark. Comprueba la conexión e inténtalo de nuevo.",
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
      "La sesión ha terminado. Inicia sesión de nuevo.",
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

  /**
   * The sentence that sent somebody looking in the wrong place. A throwable
   * that is not an `ApiError` never reached the API — it is a browser, a
   * device or this app's own code — and answering "Waymark had a problem"
   * blames the one part of the system that was never asked.
   */
  it("does not blame the server for something that never reached it", () => {
    const said = describeFailure(new TypeError("undefined is not a function"));

    expect(en(said)).not.toMatch(/waymark had a problem/iu);
    expect(en(said)).toMatch(/before waymark was asked/iu);
    expect(es(said)).toMatch(/antes de preguntar a waymark/iu);
  });

  /** And the server still gets the blame when the server is what failed. */
  it("still says the server had a problem when the server answered with one", () => {
    const said = describeFailure(new ApiError(500, "SERVER_ERROR", "boom"));

    expect(en(said)).toBe("Waymark had a problem answering. Try again in a moment.");
    expect(es(said)).toBe(
      "Waymark ha tenido un problema al responder. Inténtalo de nuevo en un momento.",
    );
  });

  it("speaks to the owner as tú, never as usted", () => {
    expect(es(describeFailure(new TypeError("undefined is not a function")))).not.toMatch(
      /\busted\b/iu,
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

/**
 * # The refusals the machine-token panel answers itself
 *
 * `describeFailure` would pass the API's own English through for all three,
 * which is the right default for a refusal nobody has met yet and the wrong
 * one for the three an operator meets constantly. These have somewhere to go:
 * pick another name, fix this one, stop looking.
 */
describe("what a machine-token refusal becomes", () => {
  const refusal = (code: string, details: Record<string, unknown> = {}) =>
    new ApiError(409, code, "the API's own words", details);

  it("names the token somebody has already used", () => {
    const said = machineTokenFailureMessage(
      refusal("MACHINE_TOKEN_NAME_ALREADY_TAKEN", { machineTokenName: "mcp-server" }),
    );

    expect(translator("en")(said)).toContain("mcp-server");
    expect(translator("es")(said)).toContain("mcp-server");
  });

  it("says what a usable name looks like, in both languages", () => {
    const said = machineTokenFailureMessage(refusal("INVALID_MACHINE_TOKEN_NAME"));

    expect(translator("en")(said)).toMatch(/lower case/i);
    expect(translator("es")(said)).toMatch(/minúsculas/i);
  });

  /**
   * Not "something went wrong": a token that is not there has very likely
   * already been revoked, which is a different thing to tell somebody who is
   * standing there wondering whether their click worked.
   */
  it("suggests the token may already be gone rather than reporting a fault", () => {
    const said = machineTokenFailureMessage(refusal("MACHINE_TOKEN_NOT_FOUND"));

    expect(translator("en")(said)).toMatch(/already have been revoked/i);
  });

  it("stays out of the way of every other failure", () => {
    expect(machineTokenFailureMessage(refusal("STORAGE_UNIT_NOT_EMPTY"))).toBeNull();
    expect(machineTokenFailureMessage(new Error("boom"))).toBeNull();
    expect(machineTokenFailureMessage(null)).toBeNull();
  });

  /** A name missing from `details` must not print the word "undefined". */
  it("survives an API that did not send the name", () => {
    const said = machineTokenFailureMessage(refusal("MACHINE_TOKEN_NAME_ALREADY_TAKEN"));

    expect(translator("en")(said)).not.toContain("undefined");
  });
});

/**
 * # A refused passkey, and the fact that every one of these is a different act
 *
 * The point of separate sentences is separate NEXT STEPS. A person whose
 * prompt timed out presses the button again; a person whose device cannot
 * check a fingerprint uses their password; a person holding a device that may
 * have been copied removes it. One sentence for all three would be telling
 * somebody in a garage to guess.
 */
describe("what a passkey refusal becomes", () => {
  const refusal = (code: string, details: Record<string, unknown> = {}) =>
    new ApiError(401, code, "the API's own words", details);

  it("tells somebody whose prompt timed out to try again, in both languages", () => {
    const said = passkeyFailureMessage(refusal("PASSKEY_CEREMONY_EXPIRED"));

    expect(en(said)).toMatch(/try again/iu);
    expect(es(said)).toMatch(/inténtalo/iu);
  });

  /**
   * The one refusal that names something, because "remove that one" is useless
   * without knowing which one.
   */
  it("names the device that may have been copied", () => {
    const said = passkeyFailureMessage(
      refusal("CLONED_PASSKEY", { label: "Pixel 8" }),
    );

    expect(en(said)).toContain("Pixel 8");
    expect(es(said)).toContain("Pixel 8");
  });

  /**
   * The rule that outranks the rest, said out loud to the person it applies
   * to: whatever went wrong with the thumb, the password is still there.
   */
  it("says the password still works, in both languages", () => {
    const said = passkeyFailureMessage(
      refusal("CLONED_PASSKEY", { label: "Pixel 8" }),
    );

    expect(en(said)).toMatch(/password still works/iu);
    expect(es(said)).toMatch(/contraseña sigue funcionando/iu);
  });

  it("explains what a device has to be able to do", () => {
    const said = passkeyFailureMessage(refusal("PASSKEY_DID_NOT_VERIFY_THE_USER"));

    expect(en(said)).toMatch(/fingerprint/iu);
    expect(es(said)).toMatch(/huella/iu);
  });

  it("says a passkey is added with a password, not with another passkey", () => {
    const said = passkeyFailureMessage(refusal("PASSKEY_NEEDS_A_PASSWORD"));

    expect(en(said)).toMatch(/password/iu);
    expect(es(said)).toMatch(/contraseña/iu);
  });

  it("speaks to the owner as tú, never as usted", () => {
    const said = passkeyFailureMessage(refusal("PASSKEY_NEEDS_A_PASSWORD"));

    expect(es(said)).not.toMatch(/\busted\b/iu);
  });

  it.each([
    ["INVALID_PASSKEY"],
    ["PASSKEY_ALREADY_REGISTERED"],
    ["INVALID_PASSKEY_LABEL"],
    ["PASSKEY_NOT_FOUND"],
    ["TOO_MANY_PASSKEY_ATTEMPTS"],
  ])("has a sentence of its own for %s", (code) => {
    const said = passkeyFailureMessage(refusal(code));

    expect(said).not.toBeNull();
    expect(es(said)).not.toBe(en(said));
  });

  it("stays null for a refusal it has no answer for", () => {
    expect(passkeyFailureMessage(refusal("STORAGE_UNIT_NOT_EMPTY"))).toBeNull();
  });

  it("stays null for something that is not an API error at all", () => {
    expect(passkeyFailureMessage(new Error("the wifi went"))).toBeNull();
  });
});

/**
 * # A ceremony the device itself could not finish
 *
 * This is the half that was missing, and it was missing in the worst
 * direction: the browser raised a `DOMException`, nothing was ever sent, and
 * the screen said Waymark had a problem answering. Somebody stood in a garage
 * being told to wait for a server that had already answered 200 twice.
 *
 * Every sentence here has to do three things — put the failure on the device,
 * say the password still works, and carry the browser's own word for what went
 * wrong so it can be reported by somebody who cannot read a console.
 */
describe("what a ceremony the device refused becomes", () => {
  const failure = (reason: string, code: string | null = null) => ({ reason, code });

  it("blames the device rather than Waymark, in both languages", () => {
    const said = passkeyCeremonyFailureMessage(failure("UnknownError"));

    expect(en(said)).toMatch(/your device/iu);
    expect(en(said)).not.toMatch(/waymark had a problem/iu);
    expect(es(said)).toMatch(/tu dispositivo/iu);
    expect(es(said)).not.toMatch(/waymark ha tenido un problema/iu);
  });

  it("says nothing was lost and the password still works, in both languages", () => {
    const said = passkeyCeremonyFailureMessage(failure("UnknownError"));

    expect(en(said)).toMatch(/password still works/iu);
    expect(es(said)).toMatch(/contraseña sigue funcionando/iu);
  });

  /**
   * The browser's word for it, passed through untranslated — the same bargain
   * `failure.asTheApiPutIt` makes with the API's own prose. A person can read
   * it out over the phone; a Spanish sentence invented here for a token the
   * specification defines in English would be a guess.
   */
  it("carries the browser's own name for the failure, verbatim", () => {
    const said = passkeyCeremonyFailureMessage(failure("UnknownError"));

    expect(en(said)).toContain("UnknownError");
    expect(es(said)).toContain("UnknownError");
  });

  it("carries the library's code beside it when there is one", () => {
    const said = passkeyCeremonyFailureMessage(
      failure("ConstraintError", "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT"),
    );

    expect(en(said)).toContain("ConstraintError");
    expect(en(said)).toContain("ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT");
  });

  it("says this device already holds one when the authenticator says so", () => {
    const said = passkeyCeremonyFailureMessage(
      failure("InvalidStateError", "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"),
    );

    expect(en(said)).toMatch(/already holds a passkey/iu);
    expect(es(said)).toMatch(/ya tiene una passkey/iu);
    expect(en(said)).toContain("InvalidStateError");
  });

  it("says the device cannot make the kind of passkey we ask for", () => {
    const said = passkeyCeremonyFailureMessage(
      failure("NotSupportedError", "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG"),
    );

    expect(en(said)).toMatch(/cannot make the kind of passkey/iu);
    expect(es(said)).toMatch(/no puede crear el tipo de passkey/iu);
    expect(en(said)).toContain("NotSupportedError");
  });

  it("says the address does not match what the server expects", () => {
    const said = passkeyCeremonyFailureMessage(failure("SecurityError", "ERROR_INVALID_RP_ID"));

    expect(en(said)).toMatch(/address/iu);
    expect(es(said)).toMatch(/dirección/iu);
    expect(en(said)).toContain("SecurityError");
  });

  /**
   * Met in the wild, on an OPPO Find X9, registering a first passkey from the
   * installed PWA. Chromium raises this one when it could not talk to
   * Android's credential manager at all — the passkey provider, not the
   * fingerprint. The device is fine and so is Waymark, and the person needs to
   * go and look at a setting no sentence about "your device" would send them
   * to.
   */
  it("sends somebody to the password manager when the credential store could not be reached", () => {
    const said = passkeyCeremonyFailureMessage(failure("NotReadableError"));

    expect(en(said)).toMatch(/password manager/iu);
    expect(es(said)).toMatch(/gestor de contraseñas/iu);
    expect(en(said)).toContain("NotReadableError");
  });

  /**
   * On the KEY, and not on the rendered sentence.
   *
   * The rendered version of this test could not fail. Every sentence here
   * carries `{reason}` — the browser's own word for the failure — so two
   * different names render differently even when they came from the SAME
   * template, and a `Set` of the renderings is five items whatever the
   * `switch` does. Collapsing all four named branches into the default left
   * it green while the four tests above it went red, which is the whole
   * evidence anybody needs about which of them was doing work.
   *
   * The key is the thing being chosen, so the key is the thing to assert.
   */
  it("gives each recognised name a sentence of its own", () => {
    const keys = new Set(
      [
        "UnknownError",
        "InvalidStateError",
        "NotSupportedError",
        "SecurityError",
        "NotReadableError",
      ].map((reason) => passkeyCeremonyFailureMessage(failure(reason)).key),
    );

    expect(keys.size).toBe(5);
  });

  it("speaks to the owner as tú, never as usted", () => {
    for (const reason of [
      "UnknownError",
      "InvalidStateError",
      "NotSupportedError",
      "SecurityError",
    ]) {
      expect(es(passkeyCeremonyFailureMessage(failure(reason)))).not.toMatch(/\busted\b/iu);
    }
  });
});

/**
 * # A photo the app could not read off the device
 *
 * The same shape of bug as the ceremony above, one floor down. React Native's
 * `FormData` streams a photo off disk, and when it cannot open that file it
 * reports a NETWORK failure — so a photo that could not be read arrived at a
 * person as "the app could not connect to Waymark". Three different things —
 * no signal, a file that is gone, a file that cannot be opened — were one
 * sentence, and it was the one sentence that sends somebody to look at their
 * router.
 *
 * So this sentence has to do three things: put the failure on the device,
 * say that NOTHING was sent and the inventory is untouched, and carry the
 * platform's own word for what stopped it.
 */
describe("what a photo that could not be read becomes", () => {
  it("blames the device rather than the connection, in both languages", () => {
    const said = photoReadFailureMessage({ reason: "no file at that location" });

    expect(en(said)).toMatch(/this device/iu);
    expect(en(said)).not.toMatch(/connect/iu);
    expect(es(said)).toMatch(/este dispositivo/iu);
    expect(es(said)).not.toMatch(/conectar/iu);
  });

  it("says nothing was sent and the inventory has not changed, in both languages", () => {
    const said = photoReadFailureMessage({ reason: "no file at that location" });

    expect(en(said)).toMatch(/never sent/iu);
    expect(en(said)).toMatch(/inventory/iu);
    expect(es(said)).toMatch(/no se ha enviado/iu);
    expect(es(said)).toMatch(/inventario/iu);
  });

  /**
   * Untranslated, for the reason `passkeys.deviceFailed` carries a
   * `DOMException` name untranslated: it is what somebody with no console can
   * read out, and inventing a Spanish rendering of a platform's own words
   * would be a guess at what the platform meant.
   */
  it("carries the platform's own word for what stopped it, verbatim", () => {
    const said = photoReadFailureMessage({ reason: "ENOENT: no such file" });

    expect(en(said)).toContain("ENOENT: no such file");
    expect(es(said)).toContain("ENOENT: no such file");
  });

  it("speaks to the owner as tú, never as usted", () => {
    expect(es(photoReadFailureMessage({ reason: "gone" }))).not.toMatch(/\busted\b/iu);
  });
});
