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

const ADAPTER_PROBE = "packages/spark-debug-adapter/src/probe.ts";

const assertHostRefused = async (code, ruleId) => {
  const messages = await lint(ADAPTER_PROBE, code);
  assert.equal(messages.length, 1, `${code}: ${messages.join("; ")}`);
  assert.ok(messages[0].startsWith(`${ruleId}: `), messages[0]);
  assert.match(messages[0], /packages\/spark-debug-adapter runs in a browser page/);
};

test("a vscode or Node built-in import under packages/spark-debug-adapter fails", async () => {
  for (const code of [
    'import * as vscode from "vscode";\nexport const probe = vscode;\n',
    'import type { Uri } from "vscode";\nexport type U = Uri;\n',
    'import { readFile } from "fs";\nexport const probe = readFile;\n',
    'import { readFile } from "node:fs";\nexport const probe = readFile;\n',
    'import { readFile } from "fs/promises";\nexport const probe = readFile;\n',
    'import path from "path";\nexport const probe = path;\n',
    'export { spawn } from "child_process";\n',
    'import process from "process";\nexport const probe = process;\n',
  ]) {
    await assertHostRefused(code, "no-restricted-imports");
  }
});

test("a dynamic import, require or import type of vscode or a Node built-in under the package fails", async () => {
  for (const code of [
    'export const load = () => import("vscode");\n',
    'export const load = () => import("node:path");\n',
    "export const load = () => import(`os`);\n",
    'const fs = require("fs");\nmodule.exports = fs;\n',
    'const fs = require("fs/promises");\nmodule.exports = fs;\n',
    'export type Fs = typeof import("node:fs");\n',
    'export type Vscode = typeof import("vscode");\n',
  ]) {
    await assertHostRefused(code, "no-restricted-syntax");
  }
});

test("the debug adapter's own dependencies and look-alike names pass under the package", async () => {
  for (const code of [
    'import { LoggingDebugSession } from "@vscode/debugadapter";\nexport const probe = LoggingDebugSession;\n',
    'import type { DebugProtocol } from "@vscode/debugprotocol";\nexport type P = DebugProtocol.Request;\n',
    'import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";\nexport const probe = Connection;\n',
    'import { RequestType } from "vscode-jsonrpc";\nexport const probe = RequestType;\n',
    'export const load = () => import("./fsHelpers");\n',
  ]) {
    assert.deepEqual(await lint(ADAPTER_PROBE, code), [], code);
  }
});

test("vscode and Node built-ins stay allowed outside packages/spark-debug-adapter", async () => {
  for (const file of ["vscode-sparkdown/src/debugger/probe.ts", "packages/spark-engine/src/probe.ts"]) {
    assert.deepEqual(await lint(file, 'import * as vscode from "vscode";\nimport fs from "node:fs";\nexport const probe = [vscode, fs];\n'), []);
  }
});

test("the Radix boundary still holds under packages/spark-debug-adapter", async () => {
  await assertRefused(ADAPTER_PROBE, PROBE, "no-restricted-imports");
  await assertRefused(ADAPTER_PROBE, 'export const load = () => import("@radix-ui/react-dialog");\n', "no-restricted-syntax");
});

test("an inline disable comment cannot lift the debug adapter boundary", async () => {
  await assertHostRefused('// eslint-disable-next-line no-restricted-imports\nimport fs from "fs";\nexport const probe = fs;\n', "no-restricted-imports");
});

const FORM_PROBE = (element) => `export const Probe = () => ${element};\n`;

test("a bare input, select or textarea in impower-dev fails with a message naming the package", async () => {
  for (const element of [
    "<input />",
    '<input type="text" value="a" />',
    '<input type="checkbox" role="switch" />',
    "<select><option>a</option></select>",
    "<textarea />",
  ]) {
    await assertRefused("impower-dev/src/modules/spark-editor/components/probe/Probe.tsx", FORM_PROBE(element), "no-restricted-syntax");
  }
});

test("a hidden file picker, the package's own controls and components with the same names pass", async () => {
  for (const element of ['<input type="file" hidden />', "<TextField />", "<Select options={[]} />", "<Switch />"]) {
    assert.deepEqual(await lint("impower-dev/src/modules/spark-editor/components/probe/Probe.tsx", FORM_PROBE(element)), []);
  }
  assert.deepEqual(await lint("packages/impower-ui/src/components/probe/Probe.tsx", FORM_PROBE("<input />")), []);
});

test("the Radix boundary still holds in impower-dev's TSX files", async () => {
  await assertRefused(
    "impower-dev/src/modules/spark-editor/components/probe/Probe.tsx",
    'export const load = () => import("@radix-ui/react-dialog");\n',
    "no-restricted-syntax",
  );
});

test("every legacy form-control file still holds a bare control, so the list only shrinks", async () => {
  const { LEGACY_FORM_CONTROL_FILES } = await import("./eslint.config.js");
  const { readFileSync } = await import("node:fs");
  for (const file of LEGACY_FORM_CONTROL_FILES) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /<(select|textarea)\b|<input\b(?![^>]*type="file")/, `${file} has no bare form control; remove it from LEGACY_FORM_CONTROL_FILES`);
  }
});

const SRC_PROBE = "impower-dev/src/modules/spark-editor/components/probe/Probe.tsx";
const assertImpowerUiSrcRefused = async (code, ruleId) => {
  const messages = await lint(SRC_PROBE, code);
  assert.equal(messages.length, 1, `${code}: ${messages.join("; ")}`);
  assert.ok(messages[0].startsWith(`${ruleId}: `), messages[0]);
  assert.match(messages[0], /@impower\/impower-ui/);
};

test("a relative import into packages/impower-ui/src from impower-dev/src fails", async () => {
  for (const code of [
    'import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";\nexport const probe = cn;\n',
    'export { cn } from "../../../../../../packages/impower-ui/src/utils/cn";\n',
    'import type { ButtonProps } from "../../../../../../packages/impower-ui/src/components/button/Button";\nexport type P = ButtonProps;\n',
    'import "../../../../../../packages/impower-ui/src/style.css";\n',
  ]) {
    await assertImpowerUiSrcRefused(code, "no-restricted-imports");
  }
  for (const code of [
    'export const load = () => import("../../../../../../packages/impower-ui/src/utils/cn");\n',
    'export type B = typeof import("../../../../../../packages/impower-ui/src/components/button/Button");\n',
  ]) {
    await assertImpowerUiSrcRefused(code, "no-restricted-syntax");
  }
});

test("impower-dev/src imports impower-ui through its package entries", async () => {
  assert.deepEqual(
    await lint(SRC_PROBE, 'import { Button, cn } from "@impower/impower-ui/components";\nexport const probe = [Button, cn];\n'),
    [],
  );
  await assertRefused(SRC_PROBE, PROBE, "no-restricted-imports");
});

test("no tracked impower-dev/src file reaches into packages/impower-ui/src", async () => {
  const { readFileSync } = await import("node:fs");
  const offenders = execFileSync("git", ["ls-files", "-z", "impower-dev/src"], { cwd: ROOT, encoding: "utf8", windowsHide: true })
    .split("\0")
    .filter((file) => SCRIPT.test(file))
    .filter((file) => /packages\/impower-ui\/src/.test(readFileSync(path.join(ROOT, file), "utf8")));
  assert.deepEqual(offenders, []);
});
