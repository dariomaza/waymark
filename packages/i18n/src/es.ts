import type { Dictionary } from "./dictionary.js";

/**
 * # Every word a person reads, in Spanish
 *
 * Neutral and professional Spanish. Not peninsular, not regional: `cosas` and
 * not `trastos`, `ordenador` nowhere near this file. Somebody reading this in
 * Bogotá and somebody reading it in Bilbao should both find it unremarkable,
 * which is the highest praise product copy gets.
 *
 * `Dictionary` is derived from the English file, so this one cannot drift: a
 * key missing here does not compile, a key that is not over there does not
 * compile, and a sentence English counts with has to be counted here too.
 *
 * ## Where it deliberately does not mirror the English
 *
 * Spanish is not English with different words. `{count} item` becomes
 * `{count} cosa` / `{count} cosas`, and the sentence around a count agrees
 * with the noun's gender — which is why each plural form is a whole sentence
 * here rather than a stem and a suffix.
 *
 * Instructions use the `usted`-neutral impersonal or the infinitive where
 * English uses a bare imperative, because a product telling somebody `haz` is
 * making a familiarity decision on their behalf.
 */
export const ES: Dictionary = {
  // ---------------------------------------------------------------------
  // The frame around every signed-in screen
  // ---------------------------------------------------------------------
  "language.label": "Idioma",
  "shell.signedInAs": "Sesión iniciada como {username}",
  "shell.signOut": "Cerrar sesión",

  "shell.opening": "Abriendo Ariadna",
  "shell.checkingSession": "Comprobando la sesión",
  "session.unconfirmed": "Ariadna no ha podido confirmar la sesión",
  "session.signInAgain": "Iniciar sesión de nuevo",

  // "Lugares" and "Cosas" for the same reason the English says "Places" and
  // "Things": these are the words somebody uses out loud in a garage, not the
  // database's `Inventario` and `Artículos`.
  "nav.label": "Principal",
  "nav.places": "Lugares",
  "nav.things": "Cosas",
  "nav.search": "Buscar",
  "nav.scan": "Escanear",

  // ---------------------------------------------------------------------
  // Counting what is inside a storage unit
  // ---------------------------------------------------------------------
  "units.treeLabel": "Unidades de almacenaje",
  "units.itemCount": { one: "{count} cosa", other: "{count} cosas" },
  "units.unitCount": { one: "{count} unidad", other: "{count} unidades" },

  // ---------------------------------------------------------------------
  // Refusals a person reads, shared by both clients
  // ---------------------------------------------------------------------

  // "y" and not "e": the rule that changes it applies before an [i] sound,
  // and neither noun this ever joins begins with one.
  "units.contentsBoth": "{items} y {units}",
  "units.notEmpty":
    "{name} todavía contiene {contents}. No se borra una caja que sigue llena.",
  "units.cyclicMove":
    "{name} no puede ir dentro de sí mismo, ni dentro de nada que ya esté dentro de él. Elija un destino fuera.",
  "units.missingTarget":
    "Esta unidad no tiene una unidad superior donde vaciarse. Elija dónde deben ir sus contenidos.",

  "items.moveRefused":
    "No se ha movido nada. {reason} Un movimiento es todo o nada, así que el resto se ha quedado donde estaba.",

  "photos.tooMany": "Esta cosa ya tiene {limit} fotos. Borre una para hacer sitio.",
  "photos.removalPending":
    "El recorte del fondo sigue pendiente. Se muestra la original, y se seguirá mostrando tanto si se recorta el fondo como si no.",
  "photos.removalFailed":
    "No se ha podido recortar el fondo de esta foto. Se muestra la original.",

  "login.wrongCredentials": "El usuario o la contraseña no son correctos.",
  "login.tooManyAttempts":
    "Demasiados intentos desde esta conexión. Espere unos minutos e inténtelo de nuevo.",
  "login.missingCredentials": "Escriba el usuario y la contraseña.",
  "login.unavailable": "Ariadna no ha podido iniciar la sesión. Inténtelo de nuevo en un momento.",

  "failure.offline":
    "La aplicación no ha podido conectar con Ariadna. Compruebe la conexión e inténtelo de nuevo.",
  "failure.notFound": "Esto ya no está aquí. Puede que se haya borrado o movido.",
  "failure.sessionEnded": "La sesión ha terminado. Inicie sesión de nuevo.",
  "failure.rateLimited": "Demasiadas peticiones. Espere un momento e inténtelo de nuevo.",
  "failure.refused": "Ariadna ha rechazado esa petición.",
  "failure.server": "Ariadna ha tenido un problema al responder. Inténtelo de nuevo en un momento.",
  "failure.asTheApiPutIt": "{reason}",

  // ---------------------------------------------------------------------
  // What a storage unit is, as a word rather than as a rule (ADR 1)
  // ---------------------------------------------------------------------
  "units.kind.room": "Habitación",
  "units.kind.furniture": "Mueble",
  "units.kind.shelf": "Estante",
  "units.kind.drawer": "Cajón",
  "units.kind.box": "Caja",
  "units.kind.bag": "Bolsa",
  "units.kind.other": "Otro",

};
