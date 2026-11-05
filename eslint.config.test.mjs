import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROBE = 'import { Dialog } from "@radix-ui/react-dialog";\nexport const probe = Dialog;\n';

const lint = async (relativePath, code = PROBE) => {
  const eslint = new ESLint({ cwd: ROOT, allowInlineConfig: false });
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, relativePath) });
  return result.messages.map((m) => `${m.ruleId}: ${m.message}`);
};

test("a @radix-ui import outside packages/impower-ui fails with a message naming the package", async () => {
  for (const file of ["impower-dev/src/probe.ts", "impower-dev/src/probe.tsx", "packages/spark-web-player/src/probe.ts"]) {
    const messages = await lint(file);
    assert.equal(messages.length, 1, `${file}: ${messages.join("; ")}`);
    assert.match(messages[0], /^no-restricted-imports: .*packages\/impower-ui/);
  }
});

test("a @radix-ui re-export and a deep subpath outside the package also fail", async () => {
  for (const code of ['export { Root } from "@radix-ui/react-tabs";\n', 'import "@radix-ui/react-slot/dist/index.mjs";\n']) {
    const messages = await lint("impower-dev/src/probe.ts", code);
    assert.equal(messages.length, 1, messages.join("; "));
    assert.match(messages[0], /^no-restricted-imports: /);
  }
});

test("the same import inside packages/impower-ui passes", async () => {
  assert.deepEqual(await lint("packages/impower-ui/src/probe.ts"), []);
  assert.deepEqual(await lint("packages/impower-ui/src/components/dialog/Dialog.tsx"), []);
});

test("an inline disable comment cannot lift the boundary", async () => {
  const code = `// eslint-disable-next-line no-restricted-imports\n${PROBE}`;
  const messages = await lint("impower-dev/src/probe.ts", code);
  assert.equal(messages.length, 1, messages.join("; "));
  assert.match(messages[0], /^no-restricted-imports: /);
});
