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
  "shell.account": "Tu cuenta",
  "shell.accountOf": "Tu cuenta, sesión iniciada como {username}",
  "shell.offline":
    "Sin conexión. Puedes consultar lo que ya está cargado; nada de lo que cambies se guardará hasta que vuelva la conexión.",

  "shell.opening": "Abriendo Waymark",
  "shell.checkingSession": "Comprobando la sesión",
  "session.unconfirmed": "Waymark no ha podido confirmar tu sesión",
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
    "{name} no puede ir dentro de sí mismo, ni dentro de nada que ya esté dentro de él. Elige un destino fuera.",
  "units.missingTarget":
    "Esta unidad no tiene una unidad superior donde vaciarse. Elige dónde deben ir sus contenidos.",

  "items.moveRefused":
    "No se ha movido nada. {reason} Un movimiento es todo o nada, así que el resto se ha quedado donde estaba.",

  "photos.tooMany": "Esta cosa ya tiene {limit} fotos. Borra una para hacer sitio.",
  "photos.removalPending":
    "El recorte del fondo sigue pendiente. Se muestra la original, y se seguirá mostrando tanto si se recorta el fondo como si no.",
  "photos.removalFailed":
    "No se ha podido recortar el fondo de esta foto. Se muestra la original.",

  "login.wrongCredentials": "El usuario o la contraseña no son correctos.",
  "login.tooManyAttempts":
    "Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo.",
  "login.missingCredentials": "Escribe el usuario y la contraseña.",
  "login.unavailable": "Waymark no ha podido iniciar la sesión. Inténtalo de nuevo en un momento.",

  "failure.offline":
    "La aplicación no ha podido conectar con Waymark. Comprueba la conexión e inténtalo de nuevo.",
  "failure.notFound": "Esto ya no está aquí. Puede que se haya borrado o movido.",
  "failure.sessionEnded": "La sesión ha terminado. Inicia sesión de nuevo.",
  "failure.rateLimited": "Demasiadas peticiones. Espera un momento e inténtalo de nuevo.",
  "failure.refused": "Waymark ha rechazado esa petición.",
  "failure.server": "Waymark ha tenido un problema al responder. Inténtalo de nuevo en un momento.",
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
  "action.tryAgain": "Inténtalo de nuevo",
  "action.selectAll": "Seleccionar todo",
  "action.clear": "Quitar",
  "action.clearSelection": "Quitar la selección",
  "action.optional": "Opcional.",
  "action.print": "Imprimir",

  // ---------------------------------------------------------------------
  // Signing in
  // ---------------------------------------------------------------------
  "login.title": "Iniciar sesión en Waymark",
  "login.tagline": "Encuentra el camino de vuelta.",
  "login.note": "Las cuentas se crean en el servidor. No hay registro.",
  "login.username": "Usuario",
  "login.password": "Contraseña",
  "login.showPassword": "Mostrar la contraseña",
  "login.submit": "Iniciar sesión",
  "login.submitting": "Iniciando sesión…",
  "login.or": "o",

  // ---------------------------------------------------------------------
  // The inventory, and the units in it
  // ---------------------------------------------------------------------
  "inventory.title": "Tu inventario",
  "inventory.loading": "Cargando tu inventario",
  "inventory.failed": "No se ha podido cargar tu inventario",
  "inventory.addRoom": "Añadir una habitación",
  "inventory.addUnit": "Añadir una unidad",
  "inventory.emptyLine":
    "Todavía no hay nada guardado. Añade una habitación, un estante o una caja para empezar.",
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
  "units.isEmptyExplains": "Lo que guardes aquí aparecerá al escanear su etiqueta.",
  "units.name": "Nombre",
  "units.kind": "Tipo",
  "units.description": "Descripción",
  "units.delete": "Borrar esta unidad",
  "units.notEmptyTitle": "Esta no está vacía",
  "units.moveEverythingInto": "Mover todo a",
  "units.chooseUnit": "Elige una unidad…",
  "units.emptyThereAndDelete": "Vaciarla ahí y borrarla",
  "units.leaveItAlone": "Dejarla como está",
  "units.emptyIt": "Vaciarla",
  "units.moveInto": "Moverla a",
  "units.moveIt": "Moverla",
  "units.kindHint": "Una etiqueta, nunca una regla: cualquier cosa puede ir dentro de cualquier cosa.",
  "units.nowhereRoot": "A ningún sitio — que sea una unidad raíz",

  // ---------------------------------------------------------------------
  // Things
  // ---------------------------------------------------------------------
  "items.everything": "Todo lo que tiene",
  "items.gathering": "Reuniendo todas las cosas",
  "items.loadingAll": "Cargando todo lo que tiene",
  "items.listFailed": "No se ha podido cargar esa lista",
  "items.everyItem": "Todas las cosas",
  "items.emptyTitle": "Todavía no has guardado nada",
  "items.emptyExplains":
    "Abre un lugar y añade la primera; aparecerá aquí y al escanear la etiqueta de ese lugar.",
  "items.loading": "Cargando esta cosa",
  "items.failed": "No se ha podido cargar esa cosa",
  "items.delete": "Borrar esta cosa",
  "items.moveInto": "Moverla a",
  "items.moveIt": "Moverla",
  "items.moveThemInto": "Moverlas a",
  "items.moveThem": "Moverlas",

  /**
   * # Picking several things, said on a phone
   *
   * The web client can afford a tick box beside every row for ever. A grid of
   * photographs three across cannot, so on a phone picking is a MODE — and a
   * mode nobody can see is a mode nobody uses. These two sentences are what
   * makes it visible: a button that starts it in words, and a line that tells
   * whoever took the button the gesture they will reach for next time.
   */
  "items.selectSeveral": "Seleccionar varias",
  "items.pickingHint":
    "Toca las cosas que quieres mover. Mantener una pulsada también lo inicia.",
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
  "scan.goToInventory": "Ir a tu inventario",

  // ---------------------------------------------------------------------
  // Finding something again
  // ---------------------------------------------------------------------
  "search.title": "Buscar",
  "search.everywhere": "Buscar en todo",
  "search.field": "Busca una cosa o una caja",
  "search.hint": "Los acentos no importan. Tienen que coincidir todas las palabras.",
  "search.fieldHint": "Una palabra de su nombre, una etiqueta o la caja donde puede estar.",
  "search.searching": "Buscando",
  "search.prompt": "Escribe lo que estás buscando",
  "search.noneExplains":
    "Tienen que coincidir todas las palabras, así que cuantas menos escribas, más encontrarás.",
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
  "shell.backToInventory": "Volver a tu inventario",
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
  "items.quantityIs": "Cantidad {count}",

  "units.deleteUndone": "Borrar {name} no se puede deshacer.",
  "units.rootNeedsTarget":
    "Una unidad raíz no tiene nada por encima en lo que vaciarse. Todo lo que hay dentro de {name} tiene que ir a otro sitio.",
  "units.emptyMovesUp":
    "Todo lo que hay dentro de {name} sube a {parent}. No se borra nada.",
  "units.everythingInside": "Todo lo que hay dentro de {name}",
  "units.emptyIntoAndDelete": "Vaciarla en {name} y borrarla",
  "units.select": "Seleccionar {name}",
  "units.qrCodeFor": "Código QR de {name}",
  "units.codeIs": "Código {code}",
  "units.openNamed": "Abrir {name}",

  "label.printWaiting": "Imprimir ({count} aún cargando)",
  "label.pageOf": "Página {page} de {total}",
  "label.anyCamera":
    "Escanear esto con cualquier cámara abre la caja en Waymark. Nadie tiene que instalar nada antes.",
  "label.symbolMissing":
    "No se ha podido obtener un símbolo, así que la hoja está incompleta y la impresión está desactivada.",
  "label.printingHint":
    "Papel A4 normal y tijeras: no hace falta papel de etiquetas. En el diálogo de impresión, desactive los encabezados y los pies de página y deje los márgenes por defecto: la página ya lleva los suyos. Lo que ve debajo es la página a su tamaño real.",
  "label.pickUnits":
    "Marque las unidades de las que quiere etiquetas, o tome una habitación entera con «todo lo que hay dentro».",
  "label.nothingPicked": "Todavía no hay nada seleccionado.",
  "label.labelCount": { one: "{count} etiqueta", other: "{count} etiquetas" },
  "label.pageCount": { one: "{count} página", other: "{count} páginas" },
  "label.countOnPages": "{labels} en {pages}.",

  "photos.coverOf": "Foto de portada de {name}",
  "photos.numberedOf": "Foto {index} de {name}",
  "photos.makeCover": "Poner la foto {index} como portada",
  "photos.moveEarlier": "Mover la foto {index} hacia delante",
  "photos.deleteNumbered": "Borrar la foto {index}",
  "photos.cameraPermission":
    "Waymark necesita permiso para usar la cámara antes de poder hacer una foto.",
  "photos.photoOf": "Foto de {name}",
  "photos.couldNotLoad": "{name} (no se ha podido cargar)",
  "photos.retryNamed": "Volver a intentar {photoId}",
  "photos.requeued": {
    one: "1 foto ha vuelto a la cola.",
    other: "{count} fotos han vuelto a la cola.",
  },

  "scan.cameraBlocked":
    "Waymark necesita permiso para usar la cámara, y la página tiene que servirse por HTTPS. En cualquier caso, el código impreso debajo del símbolo funciona igual de bien.",
  "scan.notALabel":
    "Eso no es una etiqueta de Waymark. Una etiqueta apunta a esta aplicación y termina en un código de diez caracteres.",

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

  "nav.you": "Tú",
  "nav.youNamed": "Tú, sesión iniciada como {username}",
  "account.title": "Tú",
  "account.lede": "Tu cuenta y el idioma en el que habla esta aplicación.",
  "login.show": "Mostrar",
  "login.hide": "Ocultar",
  "login.withBiometrics": "Iniciar sesión con la huella",
  "login.unlockPrompt": "Desbloquee su sesión de Waymark",
  "login.sealPrompt": "Confirme que es usted para que este teléfono recuerde su sesión de Waymark",
  "scan.cameraNeeded":
    "Waymark necesita permiso para usar la cámara y leer una etiqueta. El código impreso bajo el símbolo sirve igual de bien.",
  "units.emptyRootNote":
    "Una unidad raíz no tiene unidad superior en la que vaciarse. Todo lo que hay dentro de {name} tiene que ir a otro sitio.",
  "units.emptyIntoNote": "Todo lo que hay dentro de {name} sube a {parent}. No se borra nada.",

  // ---------------------------------------------------------------------
  // Tokens de máquina: credenciales para programas (ADR 17, ADR 18)
  // ---------------------------------------------------------------------
  "tokens.title": "Tokens de máquina",
  "tokens.explains":
    "Una clave que le das a un programa para que lea tu inventario sin tu contraseña. Cada una se revoca por separado.",
  "tokens.loading": "Cargando tus tokens de máquina",
  "tokens.none": "Todavía no hay ningún token de máquina.",

  "tokens.scopeRead": "Solo lectura",
  "tokens.scopeReadWrite": "Lectura y escritura",
  "tokens.scopeLabel": "Qué puede hacer",

  "tokens.createdOn": "Creado el {when}",
  "tokens.lastUsedOn": "Usado por última vez el {when}",
  "tokens.neverUsed": "Sin usar",
  "tokens.lapsesOn": "Caduca el {when}",
  "tokens.neverLapses": "No caduca",

  "tokens.addressTitle": "Dónde apuntarlo",
  "tokens.addressNote":
    "Esta es la dirección de Waymark a la que llama un programa. No es un secreto, así que cógela cuando la necesites.",
  "tokens.addressLabel": "La dirección de este Waymark",
  "tokens.addressCopy": "Copiar la dirección",
  "tokens.addressCopied": "Dirección copiada",

  "tokens.newAction": "Nuevo token",
  "tokens.newTitle": "Nuevo token de máquina",
  "tokens.nameLabel": "Para qué es",
  "tokens.nameHint":
    "Minúsculas, dígitos y . _ - — mcp-server, backup. Es lo que nombrarás al revocarlo.",
  "tokens.createAction": "Créalo",
  "tokens.creating": "Creando…",

  "tokens.secretTitle": "Esta es la única vez que vas a ver esto",
  "tokens.secretOnce":
    "Waymark guarda un hash, no el secreto, así que no puede volver a enseñártelo. Cópialo ahora: si lo pierdes, rota el token y coge uno nuevo.",
  "tokens.secretHow":
    "Así es como un programa dice quién es: envíalo como Authorization: Machine <token>. El esquema es Machine, no Bearer.",
  "tokens.secretLabel": "El secreto de {name}",
  "tokens.pairNote": "Los dos ajustes juntos, para el servidor MCP de Waymark:",
  "tokens.pairLabel": "La dirección y el secreto de {name}",
  "tokens.pairCopy": "Copiar los dos ajustes",
  "tokens.pairCopied": "Copiados los dos",

  "tokens.copyAction": "Copiar",
  "tokens.copied": "Copiado",
  "tokens.copyFailed": "Este navegador no lo ha copiado. Selecciónalo y cópialo a mano.",
  /**
   * The same refusal, said to somebody holding a phone.
   *
   * It is a second sentence rather than a reworded one because the ADVICE
   * differs, not just the noun. "Select it and copy it by hand" is a real
   * instruction in a browser and a dead end on Android, where the way out of
   * a refused clipboard is to hold the text until the system offers its own
   * copy — and where the credential is still on screen to be read from.
   */
  "tokens.copyFailedPhone":
    "Este teléfono no ha querido copiarlo. Mantén el texto pulsado para copiarlo tú, antes de salir de esta pantalla.",
  "tokens.storedAction": "Ya lo he guardado",

  "tokens.rotateAction": "Rotar",
  "tokens.rotateTitle": "¿Rotar {name}?",
  "tokens.rotateWarning":
    "El secreto que {name} usa ahora deja de funcionar en cuanto lo hagas. Lo que lo tenga recibirá un rechazo en cada petición hasta que pongas el nuevo secreto en su sitio.",
  "tokens.rotateConfirm": "Rótalo",
  "tokens.rotating": "Rotando…",

  "tokens.revokeAction": "Revocar",
  "tokens.revokeTitle": "¿Revocar {name}?",
  "tokens.revokeWarning":
    "{name} deja de funcionar en su siguiente petición. No se toca ningún otro token ni ninguna cuenta.",
  "tokens.revokeConfirm": "Revócalo",
  "tokens.revoking": "Revocando…",

  "tokens.nameTaken": "Ya existe un token de máquina que se llama {name}.",
  "tokens.badName":
    "Usa minúsculas, dígitos y . _ - — tiene que poder escribirse en una shell.",
  "tokens.alreadyGone":
    "No hay ningún token de máquina con ese nombre. Puede que ya se haya revocado.",

  // ---------------------------------------------------------------------
  // Passkeys: una puerta más, nunca un reemplazo (ADR 19)
  // ---------------------------------------------------------------------
  "passkeys.title": "Passkeys",
  "passkeys.explains":
    "Entra con tu huella, tu cara o el bloqueo de pantalla, en un dispositivo que ya has demostrado que es tuyo. Tu contraseña sigue funcionando igual que ahora.",
  "passkeys.loading": "Cargando tus passkeys",
  "passkeys.none": "Todavía no hay ninguna passkey.",

  "passkeys.signInAction": "Entrar con una passkey",
  "passkeys.signingIn": "Esperando a tu dispositivo…",

  "passkeys.addAction": "Añadir este dispositivo",
  "passkeys.adding": "Esperando a tu dispositivo…",
  "passkeys.nameLabel": "Qué dispositivo es",
  "passkeys.nameHint":
    "Como lo llamarías en voz alta: Pixel 8, Portátil del trabajo. Es como los distinguirás después.",
  "passkeys.addConfirm": "Añádelo",

  "passkeys.addedOn": "Añadido el {when}",
  "passkeys.lastUsedOn": "Usada por última vez el {when}",
  "passkeys.neverUsed": "Sin usar",

  "passkeys.removeAction": "Quitar",
  "passkeys.removeTitle": "¿Quitar {name}?",
  "passkeys.removeWarning":
    "{name} deja de poder entrar inmediatamente. Tu contraseña sigue funcionando, así que esto no te puede dejar fuera.",
  "passkeys.removeConfirm": "Quítala",
  "passkeys.removing": "Quitando…",

  "passkeys.cancelled": "No se ha usado ninguna passkey. Tu contraseña sigue ahí.",
  "passkeys.unsupported":
    "Este navegador no puede usar una passkey. Entra con tu contraseña.",
  "passkeys.ceremonyExpired": "Se ha tardado demasiado. Inténtalo otra vez.",
  "passkeys.notRecognised":
    "Waymark no ha reconocido esa passkey. Entra con tu contraseña y vuelve a añadir este dispositivo.",
  "passkeys.cloned":
    "La passkey {name} puede haberse copiado, así que se ha rechazado. Quítala y vuelve a añadir el dispositivo. Tu contraseña sigue funcionando.",
  "passkeys.needsVerification":
    "Ese dispositivo no puede comprobar que eres tú. Una passkey necesita una huella, una cara o un PIN.",
  "passkeys.alreadyRegistered": "Este dispositivo ya tiene una passkey de Waymark.",
  "passkeys.needsAPassword":
    "Para añadir una passkey hace falta tu contraseña. Cierra la sesión, entra con ella y añade este dispositivo.",
  "passkeys.badName": "Ponle un nombre corto al dispositivo, como Pixel 8.",
  "passkeys.alreadyGone": "Esa passkey no está. Puede que ya se haya quitado.",
  "passkeys.tooMany": "Demasiados intentos. Espera un momento o usa tu contraseña.",

};
