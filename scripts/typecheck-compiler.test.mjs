import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compilerFor } from "./typecheck-compiler.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));

function installTsc(dir, name = "") {
  const bin = path.join(dir, "node_modules", "typescript", "bin");
  mkdirSync(bin, { recursive: true });
  const tsc = path.join(bin, "tsc");
  writeFileSync(
    tsc,
    `require("node:fs").appendFileSync(process.env.TSC_LOG, ${JSON.stringify(name)} + " " + process.argv.slice(2).join(" ") + "\\n");\n`
  );
  return tsc;
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "typecheck-compiler-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(root, file, content = "{}") {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
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

test("the typecheck command runs each project with its package's compiler", (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(path.join(scripts, "typecheck.mjs"), path.join(root, "scripts", "typecheck.mjs"));
  copyFileSync(path.join(scripts, "typecheck-compiler.mjs"), path.join(root, "scripts", "typecheck-compiler.mjs"));
  installTsc(root, "root");
  installTsc(path.join(root, "packages", "ui"), "ui");
  for (const file of [
    "admin/tsconfig.json",
    "impower-app/tsconfig.json",
    "packages/concept-generator/tsconfig.json",
    "packages/impower-ui/tsconfig.json",
    "packages/sparkdown/src/inkjs/tsconfig.json",
    "packages/ui/tsconfig.app.json",
    "packages/lib/tsconfig.json",
  ]) put(root, file);
  put(root, ".gitignore", "node_modules/\n");
  execFileSync("git", ["init", "-q"], { cwd: root, windowsHide: true });
  execFileSync("git", ["add", "."], { cwd: root, windowsHide: true });

  const log = path.join(root, "tsc.log");
  const run = spawnSync(process.execPath, [path.join(root, "scripts", "typecheck.mjs"), "packages/ui/", "packages/lib/"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TSC_LOG: log },
    windowsHide: true,
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n").sort(), [
    "root --noEmit -p packages/lib/tsconfig.json",
    "ui --noEmit -p packages/ui/tsconfig.app.json",
  ]);
});
