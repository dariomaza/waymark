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

  "shell.opening": "Abriendo Waymark",
  "shell.checkingSession": "Comprobando la sesión",
  "session.unconfirmed": "Waymark no ha podido confirmar la sesión",
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
  "login.unavailable": "Waymark no ha podido iniciar la sesión. Inténtelo de nuevo en un momento.",

  "failure.offline":
    "La aplicación no ha podido conectar con Waymark. Compruebe la conexión e inténtelo de nuevo.",
  "failure.notFound": "Esto ya no está aquí. Puede que se haya borrado o movido.",
  "failure.sessionEnded": "La sesión ha terminado. Inicie sesión de nuevo.",
  "failure.rateLimited": "Demasiadas peticiones. Espere un momento e inténtelo de nuevo.",
  "failure.refused": "Waymark ha rechazado esa petición.",
  "failure.server": "Waymark ha tenido un problema al responder. Inténtelo de nuevo en un momento.",
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


  // ---------------------------------------------------------------------
  // Words that are the same wherever they appear
  // ---------------------------------------------------------------------
  "action.cancel": "Cancelar",
  "action.create": "Crear",
  "action.saveChanges": "Guardar los cambios",
  "action.saving": "Guardando…",
  "action.edit": "Editar",
  "action.move": "Mover",
  "action.delete": "Borrar",
  "action.empty": "Vaciar",
  "action.close": "Cerrar",
  "action.tryAgain": "Inténtelo de nuevo",
  "action.selectAll": "Seleccionar todo",
  "action.clear": "Quitar",
  "action.clearSelection": "Quitar la selección",
  "action.optional": "Opcional.",

  // ---------------------------------------------------------------------
  // Signing in
  // ---------------------------------------------------------------------
  "login.title": "Iniciar sesión en Waymark",
  "login.tagline": "Encuentre el camino de vuelta.",
  "login.note": "Las cuentas se crean en el servidor. No hay registro.",
  "login.username": "Usuario",
  "login.password": "Contraseña",
  "login.submit": "Iniciar sesión",
  "login.submitting": "Iniciando sesión…",

  // ---------------------------------------------------------------------
  // The inventory, and the units in it
  // ---------------------------------------------------------------------
  "inventory.title": "Su inventario",
  "inventory.loading": "Cargando su inventario",
  "inventory.failed": "No se ha podido cargar su inventario",
  "inventory.addRoom": "Añadir una habitación",
  "inventory.addUnit": "Añadir una unidad",
  "inventory.emptyLine":
    "Todavía no hay nada guardado. Añada una habitación, un estante o una caja para empezar.",
  "inventory.emptyTitle": "Todavía no hay nada registrado",
  "inventory.emptyExplains": "Empiece por una habitación y siga con los muebles que hay en ella.",

  "units.addInside": "Añadir una unidad dentro",
  "units.searchInside": "Buscar aquí dentro",
  "units.loading": "Cargando esta unidad",
  "units.notOpen": "Esa caja no está abierta",
  "units.addItem": "Añadir una cosa",
  "units.unitsInside": "Unidades dentro",
  "units.items": "Cosas",
  "units.checklistLabel": "Unidades",
  "units.isEmpty": "Esta está vacía",
  "units.isEmptyExplains": "Lo que guarde aquí aparecerá al escanear su etiqueta.",
  "units.name": "Nombre",
  "units.kind": "Tipo",
  "units.description": "Descripción",
  "units.delete": "Borrar esta unidad",
  "units.notEmptyTitle": "Esta no está vacía",
  "units.moveEverythingInto": "Mover todo a",
  "units.chooseUnit": "Elija una unidad…",
  "units.emptyThereAndDelete": "Vaciarla ahí y borrarla",
  "units.leaveItAlone": "Dejarla como está",
  "units.emptyIt": "Vaciarla",
  "units.moveInto": "Moverla a",
  "units.moveIt": "Moverla",
  "units.nowhereRoot": "A ningún sitio — que sea una unidad raíz",

  // ---------------------------------------------------------------------
  // Things
  // ---------------------------------------------------------------------
  "items.everything": "Todo lo que tiene",
  "items.gathering": "Reuniendo todas las cosas",
  "items.loadingAll": "Cargando todo lo que tiene",
  "items.listFailed": "No se ha podido cargar esa lista",
  "items.everyItem": "Todas las cosas",
  "items.emptyTitle": "Todavía no ha guardado nada",
  "items.emptyExplains":
    "Abra un lugar y añada la primera; aparecerá aquí y al escanear la etiqueta de ese lugar.",
  "items.loading": "Cargando esta cosa",
  "items.failed": "No se ha podido cargar esa cosa",
  "items.delete": "Borrar esta cosa",
  "items.moveInto": "Moverla a",
  "items.moveIt": "Moverla",
  "items.moveThemInto": "Moverlas a",
  "items.moveThem": "Moverlas",
  "items.name": "Nombre",
  "items.quantity": "Cantidad",
  "items.tags": "Etiquetas",
  "items.description": "Descripción",
  "items.tagsHint":
    "Separadas por comas. Una etiqueta es como se encuentra algo cuyo nombre se ha olvidado.",
  "items.tagsHintPhone":
    "Separadas por comas. Una etiqueta es por lo que buscar “cables” encuentra un HDMI 2.1.",

  // ---------------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------------
  "photos.title": "Fotos",
  "photos.cover": "Portada",
  "photos.add": "Añadir una foto",
  "photos.replace": "Cambiar la foto",
  "photos.remove": "Quitar esta foto",
  "photos.uploading": "Subiendo…",
  "photos.take": "Hacer una foto",
  "photos.choose": "Elegir una foto",
  "photos.unreadable": "No se ha podido leer esa foto.",
  "photos.retryRemoval": "Intentar recortar el fondo otra vez",
  "photos.seeFailed": "Ver todas las fotos que han fallado",
  "photos.processingTitle": "Recorte del fondo",
  "photos.processingLoading": "Consultando qué está pasando",
  "photos.retryAll": "Reintentar todas las fotos fallidas",
  "photos.states": "Fotos en cada estado",
  "photos.givenUpOn": "Abandonadas",
  "photos.nothingFailed": "No ha fallado nada.",
  "photos.processorUnreachable":
    "El recorte del fondo está configurado, pero el servicio no responde. Las fotos se quedan tal y como se subieron y se reintentan hasta que vuelva.",
  "photos.processorOn": "El recorte del fondo está activo y responde.",
  "photos.processorOff":
    "El recorte del fondo está desactivado. Las fotos se guardan y se muestran tal y como se subieron, y todas quedan a la espera por si más adelante aparece un servicio.",
  "photos.failedCount": {
    one: "Se ha abandonado 1 foto.",
    other: "Se han abandonado {count} fotos.",
  },
  "photos.attempts": { one: "1 intento", other: "{count} intentos" },
  "photos.lastOn": ", el último el {when}",
  "photos.showingSome": "Mostrando {count} de ellas. El recuento de arriba es la verdad completa.",
  "photos.waiting": "En espera",
  "photos.removed": "Fondo recortado",
  "photos.nothingToRemove": "Sin fondo que recortar",

  // ---------------------------------------------------------------------
  // The camera, and the label it reads
  // ---------------------------------------------------------------------
  "scan.title": "Escanear una etiqueta",
  "scan.camera": "Cámara",
  "scan.cameraFailed": "No se ha podido iniciar la cámara",
  "scan.allowCamera": "Permitir la cámara",
  "scan.typedCode": "O el código impreso bajo el símbolo",
  "scan.openUnit": "Abrir esa unidad",
  "scan.finding": "Buscando esa caja",
  "scan.opening": "Abriendo esa caja",
  "scan.lookupFailed": "No se ha podido consultar esa etiqueta",
  "scan.goToInventory": "Ir a su inventario",

  // ---------------------------------------------------------------------
  // Finding something again
  // ---------------------------------------------------------------------
  "search.title": "Buscar",
  "search.everywhere": "Buscar en todo",
  "search.field": "Busque una cosa o una caja",
  "search.hint": "Los acentos no importan. Tienen que coincidir todas las palabras.",
  "search.fieldHint": "Una palabra de su nombre, una etiqueta o la caja donde puede estar.",
  "search.searching": "Buscando",
  "search.prompt": "Escriba lo que está buscando",
  "search.noneExplains":
    "Tienen que coincidir todas las palabras, así que cuantas menos escriba, más encontrará.",
  "search.items": "Cosas",
  "search.units": "Unidades de almacenaje",
  "search.itemsFound": "Cosas encontradas",
  "search.unitsFound": "Unidades de almacenaje encontradas",

  // ---------------------------------------------------------------------
  // The printed label
  // ---------------------------------------------------------------------
  "label.loading": "Cargando la etiqueta",
  "label.loadingPhone": "Cargando esta etiqueta",
  "label.drawFailed": "No se ha podido dibujar esa etiqueta",
  "label.print": "Imprimir esta etiqueta",
  "label.backToUnit": "Volver a la unidad",
  "units.showLabel": "Etiqueta",
  "units.showLabelPhone": "Ver la etiqueta",
  "label.sheet": "Hoja de etiquetas",
  "label.printFromWeb":
    "Imprima esto desde el cliente web, que sirve el mismo símbolo como SVG.",

  // ---------------------------------------------------------------------
  // Odds and ends of the frame
  // ---------------------------------------------------------------------
  "shell.notFoundTitle": "No hay nada en esta dirección",
  "shell.notFoundBody": "Puede que el enlace sea antiguo o esté mal escrito.",
  "shell.backToInventory": "Volver a su inventario",
  "shell.connection": "Conexión",
  "shell.breadcrumb": "Ruta de navegación",


  // ---------------------------------------------------------------------
  // Sentences built around something a person named
  // ---------------------------------------------------------------------
  "sheet.delete": "Borrar {name}",
  "sheet.move": "Mover {name}",
  "sheet.edit": "Editar {name}",
  "sheet.empty": "Vaciar {name}",
  "sheet.addItemTo": "Añadir una cosa a {name}",
  "sheet.addUnitInside": "Añadir una unidad dentro de {name}",

  "items.moveCount": { one: "Mover {count} cosa", other: "Mover {count} cosas" },
  "items.deleteUndone": "Borrar {name} no se puede deshacer, y sus fotos se borran con ella.",
  "items.deleteUndoneAlone": "Borrar {name} no se puede deshacer.",
  "items.deleteWithPhotos": {
    one: "Borrar {name} también borra su foto. Esto no se puede deshacer.",
    other: "Borrar {name} también borra sus fotos. Esto no se puede deshacer.",
  },
  "items.tagsLabel": "Etiquetas: {tags}",

  "units.emptyIntoAndDelete": "Vaciarla en {name} y borrarla",
  "units.select": "Seleccionar {name}",
  "units.qrCodeFor": "Código QR de {name}",
  "units.codeIs": "Código {code}",
  "units.openNamed": "Abrir {name}",

  "label.printWaiting": "Imprimir ({count} aún cargando)",
  "label.pageOf": "Página {page} de {total}",

  "photos.coverOf": "Foto de portada de {name}",
  "photos.numberedOf": "Foto {index} de {name}",
  "photos.makeCover": "Poner la foto {index} como portada",
  "photos.moveEarlier": "Mover la foto {index} hacia delante",
  "photos.deleteNumbered": "Borrar la foto {index}",
  "photos.cameraPermission":
    "Waymark necesita permiso para usar la cámara antes de poder hacer una foto.",

  "scan.noSuchCode":
    "Ninguna unidad de este inventario lleva el código {code}. La etiqueta puede ser de otra casa, o la unidad puede haberse borrado.",

  // «» rather than “”: the angular quotation marks are the Spanish convention.
  "search.insideUnit": "Buscando dentro de {name} y de todo lo que hay debajo.",
  "search.oneUnit": "una unidad",
  "search.nothingMatches": "No hay nada que coincida con «{query}»",
  "search.matched": "Coincide en {fields}",
  "search.matchedLower": "coincide en {fields}",
  "search.field.name": "el nombre",
  "search.field.tag": "una etiqueta",
  "search.field.description": "la descripción",

};
