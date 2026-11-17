// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageDir, "..", "..");
const packageName = "@impower/impower-ui";

type Conditions = Record<string, string>;

function readManifest() {
  return JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));
}

function bundleSubpaths(manifest: {
  main: string;
  exports: Record<string, string | Conditions>;
}): Set<string> {
  const bundle = posix.normalize(manifest.main);
  const subpaths = new Set<string>();
  for (const [key, target] of Object.entries(manifest.exports)) {
    if (typeof target === "object" && target.import) {
      if (posix.normalize(target.import) === bundle) {
        subpaths.add(`${packageName}/${key.slice(2)}`);
      }
    }
  }
  return subpaths;
}

async function bundleExportNames(): Promise<Set<string>> {
  const viteConfig = readFileSync(resolve(packageDir, "vite.config.ts"), "utf8");
  const entry = /entry:\s*"([^"]+)"/.exec(viteConfig)?.[1];
  expect(entry, "vite.config.ts lib entry").toBeTruthy();
  const result = await build({
    absWorkingDir: packageDir,
    entryPoints: [entry!],
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    outdir: "out",
    packages: "external",
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: { ".css": "empty", ".svg": "text" },
    logLevel: "silent",
  });
  const output = Object.entries(result.metafile.outputs).find(([file]) =>
    file.endsWith(".js"),
  );
  return new Set(output![1].exports);
}

interface SubpathImport {
  file: string;
  specifier: string;
  name: string;
}

function collectSubpathImports(
  file: string,
  source: string,
  subpaths: Set<string>,
): SubpathImport[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: SubpathImport[] = [];
  const add = (specifier: string, name: string) =>
    found.push({ file, specifier, name });
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      subpaths.has(statement.moduleSpecifier.text)
    ) {
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) {
        continue;
      }
      if (clause.name) {
        add(specifier, "default");
      }
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly) {
            add(specifier, (element.propertyName ?? element.name).text);
          }
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      subpaths.has(statement.moduleSpecifier.text) &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) {
          add(
            statement.moduleSpecifier.text,
            (element.propertyName ?? element.name).text,
          );
        }
      }
    }
  }
  return found;
}

function consumerFiles(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--", "*.ts", "*.tsx", "*.mts", "*.js", "*.mjs", "*.jsx"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return listed
    .split("\0")
    .filter((file) => file && !file.startsWith("packages/impower-ui/"));
}

function missingImports(
  imports: SubpathImport[],
  exported: Set<string>,
): string[] {
  return imports
    .filter((entry) => !exported.has(entry.name))
    .map((entry) => `${entry.file}: ${entry.name} from ${entry.specifier}`);
}

describe("impower-ui subpaths resolved to the built bundle", () => {
  it("reports a default import the bundle does not export", async () => {
    const subpaths = bundleSubpaths(readManifest());
    const exported = await bundleExportNames();
    const imports = collectSubpathImports(
      "probe.ts",
      [
        `import FixMenu from "${packageName}/fix-menu";`,
        `import { FixMenu as Named, NotAnExport } from "${packageName}/fix-menu";`,
        `import type { FixMenuProps } from "${packageName}/fix-menu";`,
        `export { AlsoMissing } from "${packageName}/components";`,
      ].join("\n"),
      subpaths,
    );
    expect(missingImports(imports, exported)).toEqual([
      `probe.ts: default from ${packageName}/fix-menu`,
      `probe.ts: NotAnExport from ${packageName}/fix-menu`,
      `probe.ts: AlsoMissing from ${packageName}/components`,
    ]);
  });

  it("resolves every cross-package import to a bundle export", async () => {
    const subpaths = bundleSubpaths(readManifest());
    expect(subpaths.size).toBeGreaterThan(0);
    const exported = await bundleExportNames();
    const imports = consumerFiles().flatMap((file) => {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      return source.includes(`${packageName}/`)
        ? collectSubpathImports(file, source, subpaths)
        : [];
    });
    expect(imports.length).toBeGreaterThan(0);
    expect(missingImports(imports, exported)).toEqual([]);
  });
});
