/*
 * The chosen scheme, put on the page before its first paint (ADR 25).
 *
 * The app's bundle is a module and runs after the document is parsed — late
 * enough for a browser to paint once in the device's scheme and then flip.
 * This runs first because it is a plain script in the head. It is a file and
 * not inline because the page's policy is `script-src 'self'`.
 *
 * It reads the key `src/app/theme.ts` writes; `choosing-how-it-looks.test.tsx`
 * holds the two to each other. No attribute means "follow the device".
 */
(function () {
  try {
    var choice = window.localStorage.getItem("waymark.theme");

    if (choice === "light" || choice === "dark") {
      document.documentElement.setAttribute("data-theme", choice);
    }
  } catch (_) {
    // No storage, no choice: the device decides, which is the default anyway.
  }
})();
