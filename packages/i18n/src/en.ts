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
 * that the code is turned into. The same goes for the product's name: Waymark
 * is called Waymark in both languages.
 */
export const EN = {
  // ---------------------------------------------------------------------
  // The frame around every signed-in screen
  // ---------------------------------------------------------------------
  "language.label": "Language",
  "shell.signedInAs": "Signed in as {username}",
  "shell.signOut": "Sign out",

  /**
   * The title of the one surface that is about the person rather than about
   * the boxes, and the avatar's own accessible name.
   *
   * The name is in the label rather than printed above every screen. Somebody
   * who cannot see the letter in the circle still gets told who is signed in,
   * and nobody pays a row of the inventory for it.
   */
  "shell.account": "Your account",
  "shell.accountOf": "Your account, signed in as {username}",

  /**
   * What the app promises with no signal, and what it refuses to promise.
   * Reads are cached; a write is never queued (ADR 13), so the second half of
   * this sentence is the honest part and it does not get shortened away.
   */
  "shell.offline":
    "Offline. You can look at what is already loaded; nothing you change will be saved until the connection is back.",

  /** What the app is doing while the keystore is being read on a cold start. */
  "shell.opening": "Opening Waymark",
  "shell.checkingSession": "Checking your session",
  "session.unconfirmed": "Waymark could not confirm your session",
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
  "login.unavailable": "Waymark could not sign you in. Try again in a moment.",

  "failure.offline": "The app could not reach Waymark. Check the connection and try again.",
  "failure.notFound": "That is not here any more. It may have been deleted or moved.",
  "failure.sessionEnded": "Your session has ended. Sign in again.",
  "failure.rateLimited": "Too many requests. Wait a moment and try again.",
  "failure.server": "Waymark had a problem answering. Try again in a moment.",
  /**
   * For a throwable that never reached the API at all.
   *
   * It exists because `failure.server` used to answer for this too, and that
   * sentence is a lie about the one part of the system that was never asked —
   * the browser threw, nothing was sent, and somebody was told to wait for a
   * server that had already answered. What is true instead is small: it
   * happened here, nothing on the far side moved, and trying again is free.
   */
  "failure.unexpected":
    "Something went wrong in the app before Waymark was asked, so nothing you were looking at has changed. Try again, and say so if it keeps happening.",
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
  "action.print": "Print",

  // ---------------------------------------------------------------------
  // Signing in
  // ---------------------------------------------------------------------
  "login.title": "Sign in to Waymark",
  /**
   * The tagline, and the only place it is written down. A waymark is the thing
   * somebody leaves on a trail so they can find the way again, which is what a
   * label on a box is — so this is a description of the product and not a
   * slogan around it, and it is translated like any other sentence.
   */
  "login.tagline": "Find your way back.",
  "login.note": "Accounts are created on the server. There is no sign-up.",
  "login.username": "Username",
  "login.password": "Password",
  /**
   * The name does not change with the state; `aria-pressed` carries that. A
   * label that flips to "Hide password" says what the next press does and
   * never says which world you are in now.
   */
  "login.showPassword": "Show password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  /** The rule between the password form and the second door under it. */
  "login.or": "or",

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
  /**
   * A kind is a word for a shelf, not a rule about what may sit on it. ADR 1
   * makes every unit the same thing; this says so where somebody picks one.
   */
  "units.kindHint": "A label, never a rule: anything can go inside anything.",

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

  /**
   * # Picking several things, said on a phone
   *
   * The web client can afford a tick box beside every row for ever. A grid of
   * photographs three across cannot, so on a phone picking is a MODE — and a
   * mode nobody can see is a mode nobody uses. These two sentences are what
   * makes it visible: a button that starts it in words, and a line that tells
   * whoever took the button the gesture they will reach for next time.
   */
  "items.selectSeveral": "Select several",
  "items.pickingHint":
    "Tap the things you want to move. Holding one down starts this too.",
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
  "items.quantityIs": "Quantity {count}",

  "units.deleteUndone": "Deleting {name} cannot be undone.",
  /** A root has nothing above it, so emptying it has to be told where to go. */
  "units.rootNeedsTarget":
    "A root unit has no parent to empty into. Everything inside {name} has to go somewhere else.",
  "units.emptyMovesUp": "Everything inside {name} moves up into {parent}. Nothing is deleted.",
  "units.everythingInside": "Everything inside {name}",
  "units.emptyIntoAndDelete": "Empty it into {name} and delete",
  "units.select": "Select {name}",
  "units.qrCodeFor": "QR code for {name}",
  "units.codeIs": "Code {code}",
  "units.openNamed": "Open {name}",

  "label.printWaiting": "Print ({count} still loading)",
  "label.pageOf": "Page {page} of {total}",
  "label.anyCamera":
    "Scanning this with any camera opens the box in Waymark. Nobody has to install anything first.",
  "label.symbolMissing":
    "A symbol could not be fetched, so the sheet is incomplete and printing is off.",
  "label.printingHint":
    "Plain A4 and scissors — no special label paper. In the print dialog, turn headers and footers OFF and leave the margins at default: the page already carries its own. What you see below is the page at its real size.",
  "label.pickUnits":
    "Tick the units you want labels for, or take a whole room with “everything inside”.",
  "label.nothingPicked": "Nothing picked yet.",
  /** Two counts, each agreeing with its own noun. Same shape as `units.contentsBoth`. */
  "label.labelCount": { one: "{count} label", other: "{count} labels" },
  "label.pageCount": { one: "{count} page", other: "{count} pages" },
  "label.countOnPages": "{labels} on {pages}.",

  "photos.coverOf": "Cover photo of {name}",
  "photos.numberedOf": "Photo {index} of {name}",
  "photos.makeCover": "Make photo {index} the cover",
  "photos.moveEarlier": "Move photo {index} earlier",
  "photos.deleteNumbered": "Delete photo {index}",
  "photos.cameraPermission":
    "Waymark needs permission to use the camera before it can take a photo.",
  "photos.photoOf": "Photo of {name}",
  /**
   * A picture that did not arrive still has to say WHICH picture it was. The
   * name goes in rather than being read out before a bare "could not be
   * loaded", which on a gallery is the same four words twelve times.
   */
  "photos.couldNotLoad": "{name} (could not be loaded)",
  "photos.retryNamed": "Try {photoId} again",
  "photos.requeued": {
    one: "1 photo is back in the queue.",
    other: "{count} photos are back in the queue.",
  },

  /**
   * Two reasons for one symptom, because on a phone they are told apart by
   * what the person does next: grant the permission, or stop using an origin
   * that is not HTTPS. Either way the typed code below is the way through.
   */
  "scan.cameraBlocked":
    "Waymark needs permission to use the camera, and the page has to be served over HTTPS. Either way, the code printed under the symbol works just as well.",
  "scan.notALabel":
    "That is not a Waymark label. A label points at this app and ends in a ten character code.",

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

  /**
   * The fifth destination, and the only one that is not a place to look for a
   * thing. The word drawn under the avatar; the name announced beside it is
   * `nav.youNamed`, because "DM" read aloud is two letters.
   */
  "nav.you": "You",
  "nav.youNamed": "You, signed in as {username}",
  "account.title": "You",
  /**
   * Nothing on this screen is the inventory's, so it says what IS its own:
   * the account, the language, and the way out.
   */
  "account.lede": "Your account and the language this app speaks.",
  "login.show": "Show",
  "login.hide": "Hide",
  /**
   * The second door, and it says what it DOES rather than what it is: "Use
   * biometrics" is a category, and the thing somebody is about to put on the
   * sensor is a finger.
   */
  "login.withBiometrics": "Sign in with a fingerprint",
  /**
   * Sentences the operating system draws, not this app — so they have to make
   * sense inside a system dialog with a fingerprint icon above them, and they
   * have to name the app, because that dialog belongs to Android and not to
   * the screen behind it.
   */
  "login.unlockPrompt": "Unlock your Waymark session",
  "login.sealPrompt": "Confirm it is you, so this phone can remember your Waymark session",
  /**
   * Saying no to the camera is a normal answer, so this is a sentence with a
   * way forward rather than a dead screen: the code printed under the symbol
   * is typed in instead, which is why it is printed there.
   */
  "scan.cameraNeeded":
    "Waymark needs permission to use the camera to read a label. The code printed under the symbol works just as well.",
  /**
   * A root has no parent to empty into, so the API answers `MISSING_EMPTY_TARGET`
   * rather than guessing (ADR 3). Saying so before the refusal is friendlier
   * than showing it, and it is the same rule either way.
   */
  "units.emptyRootNote":
    "A root unit has no parent to empty into. Everything inside {name} has to go somewhere else.",
  "units.emptyIntoNote": "Everything inside {name} moves up into {parent}. Nothing is deleted.",

  // ---------------------------------------------------------------------
  // Machine tokens: credentials for programs (ADR 17, ADR 18)
  // ---------------------------------------------------------------------

  /**
   * The noun is the API's, in both languages, and deliberately so.
   *
   * `nav.places` chose the person's word over the database's, and that was
   * right for a tab four people tap every day. This is not that: the person
   * opening this panel is the one who also runs `machine-token create` in a
   * shell, reads the README, and has to recognise the same object in both
   * places. Inventing a friendlier word here would mean an operator holding
   * two names for one thing. The EXPLANATION is what does the humanising.
   */
  "tokens.title": "Machine tokens",
  "tokens.explains":
    "A key you give to a program, so it can read your inventory without your password. Each one is revoked on its own.",
  "tokens.loading": "Loading your machine tokens",
  "tokens.none": "No machine tokens yet.",

  "tokens.scopeRead": "Read only",
  "tokens.scopeReadWrite": "Read and write",
  "tokens.scopeLabel": "What it may do",

  "tokens.createdOn": "Made {when}",
  "tokens.lastUsedOn": "Last used {when}",
  /** The answer that makes an abandoned credential visible. */
  "tokens.neverUsed": "Never used",
  "tokens.lapsesOn": "Lapses {when}",
  "tokens.neverLapses": "Never lapses",

  /**
   * # The other half of a credential
   *
   * A secret is worthless without the address it is presented to, and that
   * address is NOT a secret: it can be read again, cached and copied freely,
   * which is why it lives on the list rather than only on the panel that
   * appears once. Somebody coming back a month later to rotate a token needs
   * it then, and the secret panel is long gone by then.
   */
  "tokens.addressTitle": "Where to point it",
  "tokens.addressNote":
    "This is the Waymark a program calls. It is not a secret, so take it as often as you need it.",
  "tokens.addressLabel": "The address of this Waymark",
  "tokens.addressCopy": "Copy the address",
  "tokens.addressCopied": "Address copied",

  "tokens.newAction": "New token",
  "tokens.newTitle": "New machine token",
  "tokens.nameLabel": "What is it for",
  "tokens.nameHint":
    "Lower case letters, digits, and any of . _ - — mcp-server, backup. It is what revoking it later names.",
  "tokens.createAction": "Create it",
  "tokens.creating": "Creating…",

  /**
   * # The sentence that has to arrive BEFORE the secret can be dismissed
   *
   * A warning shown after the only copy is gone is an epitaph. It sits beside
   * the secret, while it is still on screen and still copyable.
   */
  "tokens.secretTitle": "This is the only time you will see this",
  "tokens.secretOnce":
    "Waymark kept a hash of it, not the secret, so it cannot show it to you again. Copy it now — if it gets away from you, rotate the token and take a new one.",
  /**
   * # What the credential IS, in the sentence beside it
   *
   * `Machine` is a scheme of its own (ADR 17) and the mistake anybody wiring
   * this up at one in the morning will make is `Bearer` — which does not fail
   * as "wrong scheme", it fails as a 401 that looks exactly like a bad
   * credential. So the scheme is named, and so is the one it is not.
   */
  "tokens.secretHow":
    "It is how a program says who it is: send it as Authorization: Machine <token>. The scheme is Machine, not Bearer.",
  "tokens.secretLabel": "The secret for {name}",
  /**
   * # The pair, offered in the shape the thing that consumes it reads
   *
   * `apps/mcp` reads `WAYMARK_API_URL` and `WAYMARK_MACHINE_TOKEN` and nothing
   * else, so those two lines are exactly what somebody is about to go and
   * type. A whole config file would have been the presumptuous version of
   * this: it needs absolute paths into a checkout this browser cannot know,
   * and it differs per MCP client. Two assignments are the most this app can
   * assemble and still be certain every character of it is true.
   */
  "tokens.pairNote": "Both settings at once, for the Waymark MCP server:",
  "tokens.pairLabel": "The address and the secret for {name}",
  "tokens.pairCopy": "Copy both settings",
  "tokens.pairCopied": "Both copied",

  "tokens.copyAction": "Copy",
  "tokens.copied": "Copied",
  "tokens.copyFailed": "This browser would not copy it. Select it and copy it by hand.",
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
    "This phone would not copy it. Hold the text down to copy it yourself, before you leave this screen.",
  "tokens.storedAction": "I have stored it",

  "tokens.rotateAction": "Rotate",
  "tokens.rotateTitle": "Rotate {name}?",
  /**
   * There is no grace period, by design (ADR 18), so the outage is named
   * before the button rather than discovered after it.
   */
  "tokens.rotateWarning":
    "The secret {name} is using now stops working the moment you do this. Whatever is holding it will be refused every request until you put the new secret in place.",
  "tokens.rotateConfirm": "Rotate it",
  "tokens.rotating": "Rotating…",

  "tokens.revokeAction": "Revoke",
  "tokens.revokeTitle": "Revoke {name}?",
  "tokens.revokeWarning":
    "{name} stops working on its very next request. No other token and no account is touched.",
  "tokens.revokeConfirm": "Revoke it",
  "tokens.revoking": "Revoking…",

  "tokens.nameTaken": "There is already a machine token called {name}.",
  "tokens.badName":
    "Use lower case letters, digits, and any of . _ - — it has to be typeable in a shell.",
  "tokens.alreadyGone":
    "There is no machine token by that name. It may already have been revoked.",

  // ---------------------------------------------------------------------
  // Passkeys: an additional door, never a replacement (ADR 19)
  // ---------------------------------------------------------------------

  /**
   * # The word, and why it is the standard one
   *
   * "Passkey" is what the browser's own prompt says, what the phone's settings
   * call it, and what every other site says. A friendlier invention here would
   * mean somebody holding two names for one thing — the same argument
   * `tokens.title` makes about not renaming a machine token.
   */
  "passkeys.title": "Passkeys",
  "passkeys.explains":
    "Sign in with your fingerprint, your face or your screen lock, on a device you have already proved is yours. Your password keeps working exactly as it does now.",
  "passkeys.loading": "Loading your passkeys",
  "passkeys.none": "No passkeys yet.",

  /**
   * The button on the sign-in screen. It appears only when the platform can
   * actually serve one, so it never offers something that will fail.
   */
  "passkeys.signInAction": "Use a passkey",
  "passkeys.signingIn": "Waiting for your device…",

  "passkeys.addAction": "Add this device",
  "passkeys.adding": "Waiting for your device…",
  "passkeys.nameLabel": "What is this device",
  "passkeys.nameHint":
    "Whatever you would call it out loud — Pixel 8, Work laptop. It is how you tell them apart later.",
  "passkeys.addConfirm": "Add it",

  "passkeys.addedOn": "Added {when}",
  "passkeys.lastUsedOn": "Last used {when}",
  /** The answer that makes a device nobody uses visible. */
  "passkeys.neverUsed": "Never used",

  "passkeys.removeAction": "Remove",
  "passkeys.removeTitle": "Remove {name}?",
  /**
   * There is no "you must keep one" rule and this sentence says why, because
   * somebody about to remove their last one deserves to know they are not
   * locking themselves out (ADR 19).
   */
  "passkeys.removeWarning":
    "{name} stops being able to sign in straight away. Your password still works, so this cannot lock you out.",
  "passkeys.removeConfirm": "Remove it",
  "passkeys.removing": "Removing…",

  /**
   * # What a refused ceremony says
   *
   * Each of these is a different thing to DO, which is the whole reason they
   * are separate sentences rather than one apology.
   */
  "passkeys.cancelled": "No passkey was used. Your password is still there.",
  "passkeys.unsupported":
    "This browser cannot use a passkey. Sign in with your password.",
  "passkeys.ceremonyExpired": "That took too long. Try again.",
  "passkeys.notRecognised":
    "Waymark did not recognise that passkey. Sign in with your password, then add this device again.",
  "passkeys.cloned":
    "The passkey {name} may have been copied, so it was refused. Remove it and add the device again. Your password still works.",
  "passkeys.needsVerification":
    "That device cannot check that it is you. A passkey needs a fingerprint, a face or a PIN.",
  "passkeys.alreadyRegistered": "This device already has a passkey for Waymark.",
  "passkeys.needsAPassword":
    "Adding a passkey needs your password. Sign out, sign in with it, and add this device.",
  "passkeys.badName": "Give the device a short name, like Pixel 8.",
  "passkeys.alreadyGone": "That passkey is not there. It may already have been removed.",
  "passkeys.tooMany": "Too many attempts. Wait a moment, or use your password.",

  /**
   * # When the DEVICE could not finish, which the API never hears about
   *
   * Everything above this comment is a refusal the API made. These four are
   * the other half: the browser raised a `DOMException` and nothing was ever
   * sent, which is exactly the case that used to be shown as "Waymark had a
   * problem answering" — a sentence that was false in the worst direction,
   * because it sent somebody to wait for a server that had already answered.
   *
   * Each one says the same three things, because each is true and each is
   * what somebody needs: it happened on the device, the password still works
   * and nothing was lost, and here is the browser's own word for it.
   *
   * `{reason}` is that word — `NotSupportedError`, and the library's code
   * beside it when there is one. It is NOT translated, for the reason
   * `failure.asTheApiPutIt` is not: it is a token the specification defines in
   * English, it is what a search engine and a maintainer both recognise, and a
   * Spanish rendering of it would be a name for a thing that has no such name.
   * It is carried so that somebody with no console can still say what happened.
   */
  "passkeys.deviceFailed":
    "Your device could not finish the passkey, so Waymark was never asked. Nothing changed, and your password still works. Your device said: {reason}.",
  "passkeys.deviceHasOneAlready":
    "This device already holds a passkey for this account, so it made no second one. Nothing changed, and your password still works. Your device said: {reason}.",
  "passkeys.deviceCannotMakeOne":
    "This device cannot make the kind of passkey Waymark asks for. Nothing changed, and your password still works. Your device said: {reason}.",
  "passkeys.deviceRefusedTheAddress":
    "Your device refused the address this app is served from, so it would not use a passkey here. Nothing changed, and your password still works. Your device said: {reason}.",

} as const;
