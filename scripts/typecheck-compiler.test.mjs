import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compilerFor } from "./typecheck-compiler.mjs";

function installTsc(dir) {
  const bin = path.join(dir, "node_modules", "typescript", "bin");
  mkdirSync(bin, { recursive: true });
  const tsc = path.join(bin, "tsc");
  writeFileSync(tsc, "");
  return tsc;
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "typecheck-compiler-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("a package with its own TypeScript is checked with that compiler", (t) => {
  const root = fixture(t);
  installTsc(root);
  const own = installTsc(path.join(root, "packages", "ui"));
  assert.equal(compilerFor("packages/ui/tsconfig.app.json", root), own);
});

test("a nested project uses the nearest enclosing package's compiler", (t) => {
  const root = fixture(t);
  installTsc(root);
  const own = installTsc(path.join(root, "packages", "ui"));
  mkdirSync(path.join(root, "packages", "ui", "src", "worker"), { recursive: true });
  assert.equal(compilerFor("packages/ui/src/worker/tsconfig.json", root), own);
});

test("a package without its own TypeScript uses the root compiler", (t) => {
  const root = fixture(t);
  const rootTsc = installTsc(root);
  mkdirSync(path.join(root, "packages", "lib"), { recursive: true });
  assert.equal(compilerFor("packages/lib/tsconfig.json", root), rootTsc);
  assert.equal(compilerFor("tsconfig.json", root), rootTsc);
});
