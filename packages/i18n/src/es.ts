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
  "units.itemCount": { one: "{count} cosa", other: "{count} cosas" },
  "units.unitCount": { one: "{count} unidad", other: "{count} unidades" },
};
