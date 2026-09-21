const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/**
 * # Metro inside a pnpm workspace
 *
 * Two things are not Metro's defaults and both are load bearing.
 *
 * **It watches the whole workspace.** `@ariadna/api-client` and
 * `@ariadna/domain` are TypeScript SOURCE, not built artifacts — that is what
 * lets both clients share them with no build step between — so Metro has to be
 * allowed to read and transform files outside `apps/mobile`. pnpm links them
 * into `apps/mobile/node_modules`, and the roots below are where their real
 * files live.
 *
 * **It resolves a `.js` specifier onto the `.ts` file that will produce it.**
 * The workspace packages are compiled with `moduleResolution: NodeNext`, which
 * requires `import "./identity.js"` inside `identity.ts`. `tsc` and Vite both
 * understand that; Metro does not, and the error it gives instead is a missing
 * module in a package that is plainly there. Rewriting the specifier is how the
 * Android app gets to consume the same source the API does — the alternative is
 * a build step for two packages whose whole point is not needing one.
 */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// pnpm's store is a tree of symlinks, and a package resolved through two names
// must be the same module instance.
config.resolver.unstable_enableSymlinks = true;

const RELATIVE_JS = /^\.{1,2}\/.*\.js$/u;

const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest;

  if (RELATIVE_JS.test(moduleName)) {
    try {
      return resolve(context, moduleName.replace(/\.js$/u, ""), platform);
    } catch {
      // Not one of ours, or genuinely a `.js` file. Fall through and let the
      // real resolver produce the real error.
    }
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
