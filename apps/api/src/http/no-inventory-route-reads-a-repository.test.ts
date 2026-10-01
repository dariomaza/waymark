import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * # No inventory route reads a repository (ADR 26)
 *
 * What a person may see is decided in one place: the use cases, each of which
 * takes `Access` as a required argument. A route that reads a repository
 * itself steps around that place, and the compiler cannot notice, because the
 * repository happily answers with everybody's boxes. Three routes did exactly
 * that before ADR 26, and each was a leak waiting for a second account.
 *
 * So this file stands where the compiler cannot. It fails when an inventory
 * route file:
 *
 * 1. **imports a repository**, by name (`ItemRepository`) or by module
 *    (`prisma-item-repository.js`); or
 * 2. **calls a method on a repository**, however it got hold of one. This is
 *    decided by the TYPE of what the method is called on, through the
 *    compiler's own checker, so `options.items.findById(...)` is caught even
 *    when the repository's type arrived through an indexed type and was never
 *    imported by name.
 *
 * Built on the TypeScript compiler API rather than a regular expression, for
 * the reasons the i18n guards in both apps give: a regex reads comments as
 * code, cannot follow a type, and misses a call that wrapped onto two lines.
 *
 * ## Every route file is classified
 *
 * A route file is either about the inventory, and held to this rule, or about
 * the caller's own credentials, which are not inventory and are read through
 * their own repositories on purpose. A route file in neither list fails, so a
 * new one cannot slip past by not being named.
 */

const ROUTES_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "routes");
const API_ROOT = join(ROUTES_DIRECTORY, "..", "..", "..");

/** Held to the rule: everything here reads what somebody owns. */
export const INVENTORY_ROUTE_FILES = [
  "item-routes.ts",
  "photo-routes.ts",
  "qr-routes.ts",
  "search-routes.ts",
  "storage-unit-routes.ts",
] as const;

/**
 * A caller's own sign-in, sessions, passkeys and machine tokens, and the
 * administrator's management of other accounts (ADR 26).
 */
export const ACCOUNT_ROUTE_FILES = [
  "account-routes.ts",
  "auth-routes.ts",
  "machine-token-routes.ts",
  "passkey-routes.ts",
] as const;

const REPOSITORY_NAME = /Repository$/u;
const REPOSITORY_MODULE = /repository(\.fake)?(\.js|\.ts)?$/u;

export interface RepositoryUse {
  readonly file: string;
  readonly line: number;
  readonly what: string;
}

const compilerOptions = (): ts.CompilerOptions => {
  const configPath = join(API_ROOT, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, API_ROOT);

  return { ...parsed.options, noEmit: true };
};

/**
 * A program over the given files. `virtual` maps a path to source text that
 * is not on disk, so the guard can be tested against the shapes it exists to
 * catch without writing a file into the tree.
 */
const programOver = (
  files: readonly string[],
  virtual: ReadonlyMap<string, string> = new Map(),
): ts.Program => {
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);

  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const text = virtual.get(fileName);
    return text === undefined
      ? getSourceFile(fileName, languageVersion, ...rest)
      : ts.createSourceFile(fileName, text, languageVersion, true);
  };
  host.fileExists = (fileName) => virtual.has(fileName) || fileExists(fileName);
  host.readFile = (fileName) => virtual.get(fileName) ?? readFile(fileName);

  return ts.createProgram({ rootNames: [...files], options, host });
};

const isRepositoryType = (type: ts.Type): boolean => {
  const symbols = [type.getSymbol(), type.aliasSymbol];
  if (symbols.some((symbol) => symbol !== undefined && REPOSITORY_NAME.test(symbol.getName()))) {
    return true;
  }

  // A class implementing a port, such as `PrismaItemRepository`, is the same
  // thing under a longer name; so is a union that has one as a member.
  return type.isUnion() && type.types.some(isRepositoryType);
};

/** Every place a file imports a repository or calls one. */
export const repositoryUsesIn = (program: ts.Program, file: string): RepositoryUse[] => {
  const source = program.getSourceFile(file);
  if (source === undefined) {
    throw new Error(`The guard could not read ${file}`);
  }
  const checker = program.getTypeChecker();
  const uses: RepositoryUse[] = [];
  const report = (node: ts.Node, what: string): void => {
    uses.push({
      file,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      what,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (REPOSITORY_MODULE.test(node.moduleSpecifier.text)) {
        report(node, `imports ${node.moduleSpecifier.text}`);
      }
      const bindings = node.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          if (REPOSITORY_NAME.test(imported)) {
            report(element, `imports ${imported}`);
          }
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      isRepositoryType(checker.getTypeAtLocation(node.expression.expression))
    ) {
      report(node, `calls ${node.expression.getText(source)}`);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return uses;
};

describe("no inventory route reads a repository (ADR 26)", () => {
  it("knows every route file there is, so a new one must be classified", () => {
    const onDisk = readdirSync(ROUTES_DIRECTORY)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .sort();

    expect(onDisk).toEqual([...INVENTORY_ROUTE_FILES, ...ACCOUNT_ROUTE_FILES].sort());
  });

  it(
    "finds no repository imported or called in any inventory route file",
    () => {
      const files = INVENTORY_ROUTE_FILES.map((name) => join(ROUTES_DIRECTORY, name));
      const program = programOver(files);

      expect(files.flatMap((file) => repositoryUsesIn(program, file))).toEqual([]);
    },
    30_000,
  );

  /**
   * The guard is only as good as the shapes it recognises, so it is shown
   * each of them. A guard that silently stopped seeing one would otherwise
   * pass over the real files for ever.
   */
  describe("the shapes it catches", () => {
    const usesIn = (text: string): string[] => {
      const file = join(ROUTES_DIRECTORY, "a-route-written-to-test-the-guard.ts");
      const program = programOver([file], new Map([[file, text]]));

      return repositoryUsesIn(program, file).map((use) => use.what);
    };

    it(
      "a repository imported by name",
      () => {
        expect(
          usesIn(`import type { ItemRepository } from "@waymark/domain";
export type Unused = ItemRepository;
`),
        ).toEqual(["imports ItemRepository"]);
      },
      30_000,
    );

    it(
      "a repository adapter imported by module",
      () => {
        expect(
          usesIn(`import { PrismaItemRepository } from "../../persistence/prisma-item-repository.js";
export const Unused = PrismaItemRepository;
`),
        ).toEqual([
          "imports ../../persistence/prisma-item-repository.js",
          "imports PrismaItemRepository",
        ]);
      },
      30_000,
    );

    it(
      "a repository method called through a type that was never imported by name",
      () => {
        expect(
          usesIn(`import type { AppDependencies } from "../build-app.js";
export const read = (options: { readonly items: AppDependencies["items"] }) =>
  options.items.findAll();
`),
        ).toEqual(["calls options.items.findAll"]);
      },
      30_000,
    );

    it(
      "nothing at all in a route that goes through a use case",
      () => {
        expect(
          usesIn(`import type { Access, ListItems } from "@waymark/domain";
export const read = (options: { readonly listItems: ListItems }, access: Access) =>
  options.listItems.execute(access);
`),
        ).toEqual([]);
      },
      30_000,
    );
  });
});
