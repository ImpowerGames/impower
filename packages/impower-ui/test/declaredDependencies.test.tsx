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

const radixImports = (): Set<string> => {
  const found = new Set<string>();
  for (const file of sourceFiles(join(packageRoot, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/from\s+["'](@radix-ui\/[^/"']+)/g)) {
      found.add(match[1]!);
    }
  }
  return found;
};

describe("impower-ui dependencies", () => {
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
