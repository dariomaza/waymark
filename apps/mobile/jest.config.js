/**
 * # Driving the app the way a thumb does
 *
 * `jest-expo` is what an Expo app is tested with: it runs the React Native
 * preset, stands in for the native modules Expo ships, and is the one
 * configuration that stays true as the SDK moves.
 *
 * Two things here exist because the app shares TypeScript source with the web
 * client rather than a built package.
 *
 * `moduleNameMapper` drops the `.js` off a relative specifier, which is what
 * `moduleResolution: NodeNext` makes `@ariadna/domain` and
 * `@ariadna/api-client` write inside themselves. Metro is told the same thing
 * in `metro.config.js`; this is the same fact for the test runner.
 *
 * `transformIgnorePatterns` lets Babel compile React Native, Expo and MSW,
 * none of which ship anything this runtime can read unmodified.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/src/testing/setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  /**
   * Everything is compiled, including `node_modules`.
   *
   * The usual allowlist is a list of packages that ship ESM, and it is a list
   * that goes out of date silently: a transitive dependency of MSW or of a
   * navigator publishes `.mjs`, and a suite that was passing fails with a
   * syntax error in somebody else's file. Babel's cache makes the difference
   * a few seconds on the first run and nothing afterwards.
   */
  transformIgnorePatterns: [],
};
