import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { ROOT, selfClipClass, selfClippingComponents, violations } from "./listrow-overflow.mjs";

const snippet = {
  path: "impower-dev/src/Snippet.tsx",
  source: `export function Snippet({ text }: { text: string }) {\n  return <span class="block font-mono [--fade:20px] fade-edge">{text}</span>;\n}\n`,
};
const wrapper = {
  path: "impower-dev/src/Wrapped.tsx",
  source: `export const Wrapped = () => <div><Snippet text="x" /></div>;\n`,
};
const plain = {
  path: "impower-dev/src/Plain.tsx",
  source: `export const Plain = () => <span class="fade-edge-over min-w-0">x</span>;\n`,
};
const components = selfClippingComponents([snippet, wrapper, plain]);
const caller = (body) => ({ path: "impower-dev/src/Caller.tsx", source: `export const Caller = () => (\n  <ul>\n    ${body}\n  </ul>\n);\n` });
const lines = (body) => violations(caller(body), components).map((v) => `${v.line}:${v.overflow}`);

test("self-clipping classes are recognised as whole tokens", () => {
  for (const text of ["fade-edge", "min-w-0 truncate", "line-clamp-2 whitespace-normal", "@max-[360px]:fade-edge", "[--fade:24px] fade-edge text-ink"]) assert.ok(selfClipClass(text), text);
  for (const text of ["fade-edge-over", "line-clamp-none", "truncated", "no-truncate-x"]) assert.ok(!selfClipClass(text), text);
});

test("self-clipping components are discovered through the components they render", () => {
  assert.deepEqual([...components].sort(), ["Snippet", "Wrapped"]);
});

test("a self-clipping label without overflow self or wrap fails", () => {
  assert.deepEqual(lines(`<ListRow label={<Snippet text="a" />} />`), ["3:fade (default)"]);
  assert.deepEqual(lines(`<ListRow label={<span class="fade-edge">a</span>} />`), ["3:fade (default)"]);
  assert.deepEqual(lines(`<ListRow label={<span class="min-w-0 truncate">a</span>} />`), ["3:fade (default)"]);
  assert.deepEqual(lines(`<ListRow label={<span class="line-clamp-2">a</span>} />`), ["3:fade (default)"]);
  assert.deepEqual(lines(`<ListRow overflow="fade" label={<Wrapped />} />`), ["3:fade"]);
  assert.deepEqual(lines(`<ListRow overflow={"clamp"} label={ok ? <Snippet text="a" /> : null} />`), ["3:clamp"]);
  assert.deepEqual(lines(`<ListRow label={<span class={cn("x", "truncate")}>a</span>}>child</ListRow>`), ["3:fade (default)"]);
});

test("a self-clipping label with overflow self or wrap passes, as do labels that do not clip", () => {
  assert.deepEqual(lines(`<ListRow overflow="self" label={<Snippet text="a" />} />`), []);
  assert.deepEqual(lines(`<ListRow overflow="wrap" label={<span class="truncate">a</span>} />`), []);
  assert.deepEqual(lines(`<ListRow label="A string" />`), []);
  assert.deepEqual(lines(`<ListRow label={<Plain />} />`), []);
  assert.deepEqual(lines(`<ListRow label={<b>a</b>} class="truncate" />`), []);
  assert.deepEqual(lines(`<ListRow overflow={mode} label={<Snippet text="a" />} />`), []);
  assert.deepEqual(lines(`<ListRow {...props} label={<Snippet text="a" />} />`), []);
});

test("the repository's ListRow callers pass and the reported callers are discovered", () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-listrow-overflow.mjs")], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, / 0 violation\(s\)/);
});
