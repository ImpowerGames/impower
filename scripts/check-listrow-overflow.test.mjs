import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { ROOT, analyse, selfClipClass, violations } from "./listrow-overflow.mjs";

const snippet = {
  path: "impower-dev/src/a/Snippet.tsx",
  source: `export function Snippet({ text }: { text: string }) {\n  return <span class="block font-mono [--fade:20px] fade-edge">{text}</span>;\n}\n`,
};
const wrapper = {
  path: "impower-dev/src/a/Wrapped.tsx",
  source: `import { Snippet } from "./Snippet";\nexport const Wrapped = () => <div><Snippet text="x" /></div>;\n`,
};
const plain = {
  path: "impower-dev/src/a/Plain.tsx",
  source: `export const Plain = () => <span class="fade-edge-over min-w-0" title="truncate">x</span>;\n`,
};
const otherSnippet = {
  path: "packages/other/src/Snippet.tsx",
  source: `export function Snippet() {\n  return <span>plain</span>;\n}\n`,
};
const library = [snippet, wrapper, plain, otherSnippet];

const run = (body, { file = "impower-dev/src/a/Caller.tsx", head = `import { Snippet } from "./Snippet";\nimport { Wrapped } from "./Wrapped";\nimport { Plain } from "./Plain";\n` } = {}) => {
  const caller = { path: file, source: `${head}export const Caller = () => (\n  <ul>\n    ${body}\n  </ul>\n);\n` };
  return violations(caller, analyse([...library, caller])).map((v) => v.overflow);
};

test("self-clipping classes are recognised as whole tokens", () => {
  for (const text of ["fade-edge", "min-w-0 truncate", "line-clamp-2 whitespace-normal", "@max-[360px]:fade-edge", "[--fade:24px] fade-edge text-ink"]) assert.ok(selfClipClass(text), text);
  for (const text of ["fade-edge-over", "line-clamp-none", "truncated", "no-truncate-x"]) assert.ok(!selfClipClass(text), text);
});

test("self-clipping components are discovered by module, through the components they render", () => {
  const { clipping } = analyse(library);
  assert.deepEqual([...clipping].sort(), ["impower-dev/src/a/Snippet.tsx#Snippet", "impower-dev/src/a/Wrapped.tsx#Wrapped"]);
});

test("a self-clipping label without overflow self or wrap fails", () => {
  assert.deepEqual(run(`<ListRow label={<Snippet text="a" />} />`), ["fade"]);
  assert.deepEqual(run(`<ListRow label={<span class="fade-edge">a</span>} />`), ["fade"]);
  assert.deepEqual(run(`<ListRow label={<span class="min-w-0 truncate">a</span>} />`), ["fade"]);
  assert.deepEqual(run(`<ListRow label={<span className="line-clamp-2">a</span>} />`), ["fade"]);
  assert.deepEqual(run(`<ListRow overflow="fade" label={<Wrapped />} />`), ["fade"]);
  assert.deepEqual(run(`<ListRow overflow={"clamp"} label={ok ? <Snippet text="a" /> : null} />`), ["clamp"]);
  assert.deepEqual(run(`<ListRow label={<span class={cn("x", "truncate")}>a</span>}>child</ListRow>`), ["fade"]);
  assert.deepEqual(run(`<ListRow overflow={mode} label={<Snippet text="a" />} />`), ["not statically known"]);
  assert.deepEqual(run(`<ListRow overflow={ok ? "self" : "fade"} label={<Snippet text="a" />} />`), ["fade"]);
  assert.deepEqual(run(`<ListRow overflow={overflow} label={<Snippet text="a" />} />`, { head: `import { Snippet } from "./Snippet";\nconst overflow = "fade";\n` }), ["fade"]);
  assert.deepEqual(run(`<ListRow {...props} label={<Snippet text="a" />} />`), ["fade"]);
  assert.deepEqual(run(`<ListRow label={item} />`, { head: `import { Snippet } from "./Snippet";\nconst item = <Snippet text="a" />;\n` }), ["fade"]);
});

test("a self-clipping label with overflow self or wrap passes, as do labels that do not clip", () => {
  assert.deepEqual(run(`<ListRow overflow="self" label={<Snippet text="a" />} />`), []);
  assert.deepEqual(run(`<ListRow overflow="wrap" label={<span class="truncate">a</span>} />`), []);
  assert.deepEqual(run(`<ListRow overflow={ok ? "self" : "wrap"} label={<Snippet text="a" />} />`), []);
  assert.deepEqual(run(`<ListRow overflow={overflow} label={<Snippet text="a" />} />`, { head: `import { Snippet } from "./Snippet";\nconst overflow = "self";\n` }), []);
  assert.deepEqual(run(`<ListRow overflow={ok ? "self" : undefined} label={ok ? <span class="truncate">a</span> : "a"} />`), []);
  assert.deepEqual(run(`<ListRow label="A string" />`), []);
  assert.deepEqual(run(`<ListRow label={<Plain />} />`), []);
  assert.deepEqual(run(`<ListRow label={<span data-testid="truncate" aria-label="fade-edge">a line-clamp-2</span>} />`), []);
  assert.deepEqual(run(`<ListRow label={<b>a</b>} class="truncate" />`), []);
  assert.deepEqual(run(`<ListRow label={<Snippet />} />`, { file: "packages/other/src/Caller.tsx", head: `import { Snippet } from "./Snippet";\n` }), []);
});

test("the repository's ListRow callers pass and the reported callers are discovered", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-listrow-overflow.mjs")], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, / 0 violation\(s\)/);
});
