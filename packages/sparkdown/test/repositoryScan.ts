import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const sourcesUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        if (name === "node_modules") return [];
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourcesUnder(path);
        return /\.(m?ts|m?js)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
      })
    : [];

export const scanOf = <T>(
  prefix: string,
  files: Record<string, string>,
  scan: (repo: string) => T,
): T => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return scan(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};
