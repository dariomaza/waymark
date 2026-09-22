/**
 * # Every word a person reads, in English
 *
 * This file is the SOURCE of the contract, not merely one of two translations.
 * `Dictionary` is derived from it (see `dictionary.ts`), so the keys here are
 * the keys that exist, the holes in these sentences are the values a screen
 * must hand over, and a phrase written with plural forms here is one Spanish
 * must also count.
 *
 * ## `as const` is load-bearing
 *
 * Without it these are just `string` and the braces are just characters. With
 * it, TypeScript can read `{username}` out of the type and refuse a screen
 * that forgets to pass one. Do not widen it.
 *
 * ## What is NOT here
 *
 * The API's error codes and the domain's vocabulary. `STORAGE_UNIT_NOT_EMPTY`
 * is a contract between two machines and means the same thing in Madrid as in
 * Manchester; what a person reads WHEN it happens is the sentence in this file
 * that the code is turned into. The same goes for the product's name: Ariadna
 * is called Ariadna in both languages.
 */
export const EN = {
  // ---------------------------------------------------------------------
  // The frame around every signed-in screen
  // ---------------------------------------------------------------------
  "language.label": "Language",
  "shell.signedInAs": "Signed in as {username}",
  "shell.signOut": "Sign out",

  /** What the app is doing while the keystore is being read on a cold start. */
  "shell.opening": "Opening Ariadna",
  "shell.checkingSession": "Checking your session",
  "session.unconfirmed": "Ariadna could not confirm your session",
  "session.signInAgain": "Sign in again",

  /** The name of the landmark itself, announced before the links inside it. */
  "nav.label": "Main",

  /**
   * "Places" and "Things", not "Inventory" and "Items".
   *
   * The two words a person uses standing in a garage are where and what.
   * "Inventory" is the name of the database; the tab is for the person, so it
   * takes the person's word — and the Spanish does the same rather than
   * translating the database's word into `Inventario`.
   */
  "nav.places": "Places",
  "nav.things": "Things",
  "nav.search": "Search",
  "nav.scan": "Scan",

  // ---------------------------------------------------------------------
  // Counting what is inside a storage unit
  // ---------------------------------------------------------------------
  "units.treeLabel": "Storage units",
  "units.itemCount": { one: "{count} item", other: "{count} items" },
  "units.unitCount": { one: "{count} unit", other: "{count} units" },

  // ---------------------------------------------------------------------
  // Refusals a person reads, shared by both clients
  // ---------------------------------------------------------------------

  /** Composed from two counts, each agreeing with its own noun. See `refusals.ts`. */
  "units.contentsBoth": "{items} and {units}",
  "units.notEmpty":
    "{name} still holds {contents}. Nothing is deleted with a box still full.",
  "units.cyclicMove":
    "{name} cannot go inside itself, or inside anything already inside it. Pick somewhere outside it.",
  "units.missingTarget":
    "This unit has no parent to empty into. Choose where its contents should go.",

  "items.moveRefused":
    "Nothing was moved. {reason} A move is all or nothing, so the rest stayed where they were.",

  "photos.tooMany": "This item already holds {limit} photos. Delete one to make room.",
  "photos.removalPending":
    "Background removal is still pending. The original is shown, and it stays shown whether or not the background is ever removed.",
  "photos.removalFailed":
    "Background removal failed for this photo. The original is shown instead.",

  "login.wrongCredentials": "That username or password is wrong.",
  "login.tooManyAttempts":
    "Too many attempts from this connection. Wait a few minutes and try again.",
  "login.missingCredentials": "Fill in both a username and a password.",
  "login.unavailable": "Ariadna could not sign you in. Try again in a moment.",

  "failure.offline": "The app could not reach Ariadna. Check the connection and try again.",
  "failure.notFound": "That is not here any more. It may have been deleted or moved.",
  "failure.sessionEnded": "Your session has ended. Sign in again.",
  "failure.rateLimited": "Too many requests. Wait a moment and try again.",
  "failure.refused": "Ariadna refused that request.",
  "failure.server": "Ariadna had a problem answering. Try again in a moment.",
  /**
   * The API's own sentence about the exact situation, passed through. It
   * arrives in English and stays that way — see `describeFailure`.
   */
  "failure.asTheApiPutIt": "{reason}",

  // ---------------------------------------------------------------------
  // What a storage unit is, as a word rather than as a rule (ADR 1)
  // ---------------------------------------------------------------------
  "units.kind.room": "Room",
  "units.kind.furniture": "Furniture",
  "units.kind.shelf": "Shelf",
  "units.kind.drawer": "Drawer",
  "units.kind.box": "Box",
  "units.kind.bag": "Bag",
  "units.kind.other": "Other",


  // ---------------------------------------------------------------------
  // Words that are the same wherever they appear
  // ---------------------------------------------------------------------
  "action.cancel": "Cancel",
  "action.create": "Create",
  "action.saveChanges": "Save changes",
  "action.saving": "Saving…",
  "action.edit": "Edit",
  "action.move": "Move",
  "action.delete": "Delete",
  "action.empty": "Empty",
  "action.close": "Close",
  "action.tryAgain": "Try again",
  "action.selectAll": "Select all",
  "action.clear": "Clear",
  "action.clearSelection": "Clear selection",
  "action.optional": "Optional.",

  // ---------------------------------------------------------------------
  // Signing in
  // ---------------------------------------------------------------------
  "login.title": "Sign in to Ariadna",
  "login.note": "Accounts are created on the server. There is no sign-up.",
  "login.username": "Username",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",

  // ---------------------------------------------------------------------
  // The inventory, and the units in it
  // ---------------------------------------------------------------------
  "inventory.title": "Your inventory",
  "inventory.loading": "Loading your inventory",
  "inventory.failed": "Your inventory could not be loaded",
  "inventory.addRoom": "Add a room",
  "inventory.addUnit": "Add a unit",
  "inventory.emptyLine": "Nothing stored yet. Add a room, a shelf or a box to start.",
  "inventory.emptyTitle": "Nothing is registered yet",
  "inventory.emptyExplains": "Start with a room, then the furniture in it.",

  "units.addInside": "Add a unit inside",
  "units.searchInside": "Search inside",
  "units.loading": "Loading this unit",
  "units.notOpen": "That box is not open",
  "units.addItem": "Add an item",
  "units.unitsInside": "Units inside",
  "units.items": "Items",
  "units.checklistLabel": "Units",
  "units.isEmpty": "This one is empty",
  "units.isEmptyExplains": "Whatever you put in here will show up when you scan its label.",
  "units.name": "Name",
  "units.kind": "Kind",
  "units.description": "Description",
  "units.delete": "Delete this unit",
  "units.notEmptyTitle": "This one is not empty",
  "units.moveEverythingInto": "Move everything into",
  "units.chooseUnit": "Choose a unit…",
  "units.emptyThereAndDelete": "Empty it there and delete",
  "units.leaveItAlone": "Leave it alone",
  "units.emptyIt": "Empty it",
  "units.moveInto": "Move it into",
  "units.moveIt": "Move it",
  "units.nowhereRoot": "Nowhere — make it a root",

  // ---------------------------------------------------------------------
  // Things
  // ---------------------------------------------------------------------
  "items.everything": "Everything you own",
  "items.gathering": "Gathering every item",
  "items.loadingAll": "Loading everything you own",
  "items.listFailed": "That list could not be loaded",
  "items.everyItem": "Every item",
  "items.emptyTitle": "You have not put anything in yet",
  "items.emptyExplains":
    "Open a place and add the first one; it will show up here and when you scan that place’s label.",
  "items.loading": "Loading this item",
  "items.failed": "That item could not be loaded",
  "items.delete": "Delete this item",
  "items.moveInto": "Move it into",
  "items.moveIt": "Move it",
  "items.moveThemInto": "Move them into",
  "items.moveThem": "Move them",
  "items.name": "Name",
  "items.quantity": "Quantity",
  "items.tags": "Tags",
  "items.description": "Description",
  "items.tagsHint":
    "Separated by commas. A tag is how you find a thing whose name you have forgotten.",
  "items.tagsHintPhone":
    "Separated by commas. A tag is why searching “cables” finds an HDMI 2.1.",

  // ---------------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------------
  "photos.title": "Photos",
  "photos.cover": "Cover",
  "photos.add": "Add a photo",
  "photos.replace": "Replace the photo",
  "photos.remove": "Remove this photo",
  "photos.uploading": "Uploading…",
  "photos.take": "Take a photo",
  "photos.choose": "Choose a photo",
  "photos.unreadable": "That photo could not be read.",
  "photos.retryRemoval": "Try removing the background again",
  "photos.seeFailed": "See every photo that failed",
  "photos.processingTitle": "Background removal",
  "photos.processingLoading": "Asking what is happening",
  "photos.retryAll": "Retry every failed photo",
  "photos.states": "Photos in each state",
  "photos.givenUpOn": "Given up on",
  "photos.nothingFailed": "Nothing has failed.",
  "photos.processorUnreachable":
    "Background removal is configured but the sidecar is not answering. Photos stay as they were uploaded and are retried until it comes back.",
  "photos.processorOn": "Background removal is on and answering.",
  "photos.processorOff":
    "Background removal is switched off. Photos are stored and shown exactly as they were uploaded, and every one of them waits in case a sidecar appears later.",
  /**
   * The verb moves with the number in both languages — "was" to "were",
   * "se ha" to "se han" — which is why the whole sentence has two forms
   * rather than an `s` being glued onto `photo`.
   */
  "photos.failedCount": {
    one: "1 photo was given up on.",
    other: "{count} photos were given up on.",
  },
  "photos.attempts": { one: "1 attempt", other: "{count} attempts" },
  "photos.lastOn": ", last on {when}",
  "photos.showingSome": "Showing {count} of them. The count above is the whole truth.",
  "photos.waiting": "Waiting",
  "photos.removed": "Background removed",
  "photos.nothingToRemove": "Nothing to remove",

  // ---------------------------------------------------------------------
  // The camera, and the label it reads
  // ---------------------------------------------------------------------
  "scan.title": "Scan a label",
  "scan.camera": "Camera",
  "scan.cameraFailed": "The camera could not be started",
  "scan.allowCamera": "Allow the camera",
  "scan.typedCode": "Or the code printed under the symbol",
  "scan.openUnit": "Open that unit",
  "scan.finding": "Finding that box",
  "scan.opening": "Opening that box",
  "scan.lookupFailed": "That label could not be looked up",
  "scan.goToInventory": "Go to your inventory",

  // ---------------------------------------------------------------------
  // Finding something again
  // ---------------------------------------------------------------------
  "search.title": "Search",
  "search.everywhere": "Search everywhere",
  "search.field": "Search for a thing or a box",
  "search.hint": "Accents do not matter. Every word has to match.",
  "search.fieldHint": "A word from its name, a tag, or the box it might be in.",
  "search.searching": "Searching",
  "search.prompt": "Type what you are looking for",
  "search.noneExplains": "Every word has to match, so fewer of them finds more.",
  "search.items": "Items",
  "search.units": "Storage units",
  "search.itemsFound": "Items found",
  "search.unitsFound": "Storage units found",

  // ---------------------------------------------------------------------
  // The printed label
  // ---------------------------------------------------------------------
  "label.loading": "Loading the label",
  "label.loadingPhone": "Loading this label",
  "label.drawFailed": "That label could not be drawn",
  "label.print": "Print this label",
  "label.backToUnit": "Back to the unit",
  "units.showLabel": "Label",
  "units.showLabelPhone": "Show the label",
  "label.sheet": "Label sheet",
  "label.printFromWeb":
    "Print this from the web client, which serves the same symbol as an SVG.",

  // ---------------------------------------------------------------------
  // Odds and ends of the frame
  // ---------------------------------------------------------------------
  "shell.notFoundTitle": "There is nothing at this address",
  "shell.notFoundBody": "The link may be old, or mistyped.",
  "shell.backToInventory": "Back to your inventory",
  "shell.connection": "Connection",
  "shell.breadcrumb": "Breadcrumb",


  // ---------------------------------------------------------------------
  // Sentences built around something a person named
  // ---------------------------------------------------------------------
  "sheet.delete": "Delete {name}",
  "sheet.move": "Move {name}",
  "sheet.edit": "Edit {name}",
  "sheet.empty": "Empty {name}",
  "sheet.addItemTo": "Add an item to {name}",
  "sheet.addUnitInside": "Add a unit inside {name}",

  "items.moveCount": { one: "Move {count} item", other: "Move {count} items" },
  "items.deleteUndone": "Deleting {name} cannot be undone, and its photos are deleted with it.",
  "items.deleteUndoneAlone": "Deleting {name} cannot be undone.",
  "items.deleteWithPhotos": {
    one: "Deleting {name} also deletes its photo. This cannot be undone.",
    other: "Deleting {name} also deletes its photos. This cannot be undone.",
  },
  "items.tagsLabel": "Tags: {tags}",

  "units.emptyIntoAndDelete": "Empty it into {name} and delete",
  "units.select": "Select {name}",
  "units.qrCodeFor": "QR code for {name}",
  "units.codeIs": "Code {code}",
  "units.openNamed": "Open {name}",

  "label.printWaiting": "Print ({count} still loading)",
  "label.pageOf": "Page {page} of {total}",

  "photos.coverOf": "Cover photo of {name}",
  "photos.numberedOf": "Photo {index} of {name}",
  "photos.makeCover": "Make photo {index} the cover",
  "photos.moveEarlier": "Move photo {index} earlier",
  "photos.deleteNumbered": "Delete photo {index}",
  "photos.cameraPermission":
    "Ariadna needs permission to use the camera before it can take a photo.",

  "scan.noSuchCode":
    "No unit in this inventory carries the code {code}. The label may belong to another house, or the unit may have been deleted.",

  "search.insideUnit": "Searching inside {name}, and everything under it.",
  "search.oneUnit": "one unit",
  "search.nothingMatches": "Nothing matches “{query}”",
  "search.matched": "Matched {fields}",
  "search.matchedLower": "matched {fields}",
  "search.field.name": "name",
  "search.field.tag": "tag",
  "search.field.description": "description",

} as const;
