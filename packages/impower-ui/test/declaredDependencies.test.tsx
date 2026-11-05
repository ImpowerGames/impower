import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(import.meta.dirname, "..");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });

const radixSpecifier =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["'](@radix-ui\/[^/"']+)/g;

const radixImportsIn = (text: string): string[] =>
  [...text.matchAll(radixSpecifier)].map((match) => match[1]!);

const radixImports = (): Set<string> =>
  new Set(
    sourceFiles(join(packageRoot, "src")).flatMap((file) =>
      radixImportsIn(readFileSync(file, "utf8")),
    ),
  );

describe("impower-ui dependencies", () => {
  it("recognizes every module import form", () => {
    expect(
      radixImportsIn(
        [
          `import { Slot } from "@radix-ui/react-slot";`,
          `import * as Dialog from '@radix-ui/react-dialog/dist';`,
          `import "@radix-ui/react-compose-refs";`,
          `const tabs = await import("@radix-ui/react-tabs");`,
          `export { Root } from "@radix-ui/react-select";`,
          `import type { TooltipProps } from "@radix-ui/react-tooltip";`,
        ].join("\n"),
      ),
    ).toEqual([
      "@radix-ui/react-slot",
      "@radix-ui/react-dialog",
      "@radix-ui/react-compose-refs",
      "@radix-ui/react-tabs",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
    ]);
  });

  it("declares every Radix package its source imports", () => {
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const declared = Object.keys(manifest.dependencies ?? {});
    const imported = [...radixImports()].sort();
    expect(imported).toContain("@radix-ui/react-slot");
    expect(imported.filter((name) => !declared.includes(name))).toEqual([]);
  });
});
