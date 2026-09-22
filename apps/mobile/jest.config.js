/**
 * # Driving the app the way a thumb does
 *
 * `jest-expo` is what an Expo app is tested with: it runs the React Native
 * preset, stands in for the native modules Expo ships, and is the one
 * configuration that stays true as the SDK moves.
 *
 * The one thing here that is not a default exists because the app shares
 * TypeScript source with the web client rather than a built package.
 *
 * `moduleNameMapper` drops the `.js` off a relative specifier, which is what
 * `moduleResolution: NodeNext` makes `@waymark/domain` and
 * `@waymark/api-client` write inside themselves. Metro is told the same thing
 * in `metro.config.js`; this is the same fact for the test runner.
 *
 * ## There is deliberately no `transformIgnorePatterns` here
 *
 * This file used to carry `transformIgnorePatterns: []` — compile everything,
 * `node_modules` included — on the reasoning that an allowlist of ESM-shipping
 * packages goes out of date silently and costs "a few seconds on the first run
 * and nothing afterwards".
 *
 * The reasoning about the allowlist is sound and the arithmetic is not quite.
 * Measured on this suite, from an empty transform cache: the empty list takes
 * 11.1 s and writes 2128 compiled files; the preset's own patterns take 9.8 s
 * and write 1481. Not the difference the comment feared, but not nothing
 * either, and it grows with whatever the dependency tree drags in rather than
 * with anything this app wrote.
 *
 * `jest-expo`'s pattern already handles a pnpm store, which is not obvious
 * from reading it. It allows `node_modules/.pnpm`, and at a glance that looks
 * like it allows the whole store — but the pattern is a SEARCH, not an
 * anchored match, so it goes on to find the second `/node_modules/` in
 * `.pnpm/nanoid@5.1.6/node_modules/nanoid/index.js` and excludes the package
 * by its real name there.
 *
 * If a package ever does need compiling and is not covered, the failure is a
 * syntax error naming its own file. The fix is to add that ONE package:
 *
 *     const preset = require("jest-expo/jest-preset");
 *     transformIgnorePatterns: [
 *       preset.transformIgnorePatterns[0].replace(")", "|the-package)"),
 *       ...preset.transformIgnorePatterns.slice(1),
 *     ]
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/src/testing/setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
