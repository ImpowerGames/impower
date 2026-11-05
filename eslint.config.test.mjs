import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROBE = 'import { Dialog } from "@radix-ui/react-dialog";\nexport const probe = Dialog;\n';
const SCRIPT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const eslint = () => new ESLint({ cwd: ROOT, allowInlineConfig: false });

const lint = async (relativePath, code = PROBE) => {
  const [result] = await eslint().lintText(code, { filePath: path.join(ROOT, relativePath) });
  return result.messages.map((m) => `${m.ruleId}: ${m.message}`);
};

const assertRefused = async (relativePath, code, ruleId) => {
  const messages = await lint(relativePath, code);
  assert.equal(messages.length, 1, `${relativePath}: ${messages.join("; ")}`);
  assert.ok(messages[0].startsWith(`${ruleId}: `), messages[0]);
  assert.match(messages[0], /packages\/impower-ui/);
};

test("a @radix-ui import outside packages/impower-ui fails with a message naming the package", async () => {
  for (const file of [
    "impower-dev/src/probe.ts",
    "impower-dev/src/probe.tsx",
    "impower-dev/src/build/probe.ts",
    "impower-dev/test/build/probe.test.ts",
    "packages/spark-web-player/src/probe.ts",
  ]) {
    await assertRefused(file, PROBE, "no-restricted-imports");
  }
});

test("a @radix-ui re-export, type import, import-equals and deep subpath outside the package also fail", async () => {
  for (const code of [
    'export { Root } from "@radix-ui/react-tabs";\n',
    'import dialog = require("@radix-ui/react-dialog");\nexport const probe = dialog;\n',
    'import type { DialogProps } from "@radix-ui/react-dialog";\nexport type P = DialogProps;\n',
    'import "@radix-ui/react-slot/dist/index.mjs";\n',
  ]) {
    await assertRefused("impower-dev/src/probe.ts", code, "no-restricted-imports");
  }
});

test("a dynamic import, require or import type of @radix-ui outside the package fails", async () => {
  for (const code of [
    'export const load = () => import("@radix-ui/react-dialog");\n',
    "export const load = () => import(`@radix-ui/react-dialog`);\n",
    'const dialog = require("@radix-ui/react-dialog");\nmodule.exports = dialog;\n',
    'export type Dialog = typeof import("@radix-ui/react-dialog");\n',
  ]) {
    await assertRefused("impower-dev/src/probe.ts", code, "no-restricted-syntax");
  }
});

test("the same imports inside packages/impower-ui pass", async () => {
  assert.deepEqual(await lint("packages/impower-ui/src/probe.ts"), []);
  assert.deepEqual(await lint("packages/impower-ui/src/components/dialog/Dialog.tsx"), []);
  assert.deepEqual(
    await lint("packages/impower-ui/src/probe.ts", 'export const load = () => import("@radix-ui/react-dialog");\n'),
    [],
  );
});

test("an unrelated package whose name starts with @radix-ui passes", async () => {
  assert.deepEqual(
    await lint("impower-dev/src/probe.ts", 'export const load = () => import("@radix-uix/thing");\n'),
    [],
  );
});

test("an inline disable comment cannot lift the boundary", async () => {
  await assertRefused("impower-dev/src/probe.ts", `// eslint-disable-next-line no-restricted-imports\n${PROBE}`, "no-restricted-imports");
});

test("no tracked script file is ignored by the lint", async () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", windowsHide: true })
    .split("\0")
    .filter((file) => SCRIPT.test(file));
  assert.ok(tracked.length > 1000, `only ${tracked.length} tracked script files`);
  const linter = eslint();
  const ignored = [];
  for (const file of tracked) {
    if (await linter.isPathIgnored(path.join(ROOT, file))) {
      ignored.push(file);
    }
  }
  assert.deepEqual(ignored, []);
});
