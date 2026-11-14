import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { ROOT, analyse, selfClipClass, violations } from "./listrow-overflow.mjs";

const snippet = {
  path: "impower-dev/src/a/Snippet.tsx",
  source: `export function Snippet({ text }: { text?: string }) {\n  return <span class="block font-mono [--fade:20px] fade-edge">{text}</span>;\n}\n`,
};
const wrapper = {
  path: "impower-dev/src/a/Wrapped.tsx",
  source: `import { Snippet } from "./Snippet";\nexport const Wrapped = () => <div><Snippet text="x" /></div>;\n`,
};
const plain = {
  path: "impower-dev/src/a/Plain.tsx",
  source: `export const Plain = () => <span class="fade-edge-over min-w-0" title="truncate">x</span>;\n`,
};
const barrel = {
  path: "impower-dev/src/a/index.ts",
  source: `export { Snippet as Clip } from "./Snippet";\nexport { Plain } from "./Plain";\n`,
};
const otherSnippet = {
  path: "packages/other/src/Snippet.tsx",
  source: `export function Snippet() {\n  return <span>plain</span>;\n}\n`,
};
const library = [snippet, wrapper, plain, barrel, otherSnippet];

const IMPORTS = `import { ListRow } from "@impower/impower-ui/components";\nimport type { VNode } from "preact";\nimport { Snippet } from "./Snippet";\nimport { Wrapped } from "./Wrapped";\nimport { Plain } from "./Plain";\n`;

const run = (body, { file = "impower-dev/src/a/Caller.tsx", head = "", imports = IMPORTS } = {}) => {
  const caller = { path: file, source: `${imports}${head}export const Caller = () => (\n  <ul>\n    ${body}\n  </ul>\n);\n` };
  return violations(caller, analyse([...library, caller])).map((v) => `${v.reason}:${v.overflow}`);
};

test("self-clipping classes are recognised as whole tokens", () => {
  for (const text of ["fade-edge", "min-w-0 truncate", "line-clamp-2 whitespace-normal", "@max-[360px]:fade-edge", "[--fade:24px] fade-edge text-ink"]) assert.ok(selfClipClass(text), text);
  for (const text of ["fade-edge-over", "line-clamp-none", "truncated", "no-truncate-x"]) assert.ok(!selfClipClass(text), text);
});

test("self-clipping components are discovered by declaration, through the components they render", () => {
  const { clipping } = analyse(library);
  assert.deepEqual([...clipping].sort(), ["impower-dev/src/a/Snippet.tsx#Snippet", "impower-dev/src/a/Wrapped.tsx#Wrapped"]);
});

test("a self-clipping label without overflow self or wrap fails", () => {
  assert.deepEqual(run(`<ListRow label={<Snippet text="a" />} />`), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow label={<span class="fade-edge">a</span>} />`), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow label={<span class="min-w-0 truncate">a</span>} />`), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow label={<span className="line-clamp-2">a</span>} />`), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow overflow="fade" label={<Wrapped />} />`), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow overflow={"clamp"} label={ok ? <Snippet text="a" /> : null} />`, { head: `declare const ok: boolean;\n` }), ["clips:clamp"]);
  assert.deepEqual(run(`<ListRow label={<span class={cn("x", "truncate")}>a</span>} />`, { head: `declare function cn(...c: string[]): string;\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow overflow={mode} label={<Snippet text="a" />} />`, { head: `declare const mode: "self" | "fade";\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow overflow={mode} label={<Snippet text="a" />} />`, { head: `declare const mode: string;\n` }), ["clips:not statically known"]);
  assert.deepEqual(run(`<ListRow overflow={ok ? "self" : "fade"} label={<Snippet text="a" />} />`, { head: `declare const ok: boolean;\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow overflow={overflow} label={<Snippet text="a" />} />`, { head: `const overflow = "fade";\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow label={item} />`, { head: `const item = <Snippet text="a" />;\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow {...props} />`, { head: `const props = { label: <span class="fade-edge">a</span> };\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow {...props} />`, { head: `const label = <span class="fade-edge">a</span>;\nconst props = { label, overflow: "clamp" as const };\n` }), ["clips:clamp"]);
  assert.deepEqual(run(`<ListRow {...{ label: <span class="truncate">a</span> }} overflow="fade" />`), ["clips:fade"]);
});

test("every ListRow spelling is recognised through the type checker", () => {
  assert.deepEqual(run(`<MenuRow label={<span class="truncate">a</span>} />`, { imports: `import { ListRow as MenuRow } from "@impower/impower-ui/components";\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<UI.ListRow label={<Snippet />} />`, { imports: `import * as UI from "@impower/impower-ui/components";\nimport { Snippet } from "./Snippet";\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<Row label={<Snippet />} />`, { head: `const Row = ListRow;\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow label={<parts.Snippet />} />`, { imports: `import { ListRow } from "@impower/impower-ui/components";\nimport * as parts from "./Snippet";\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<UI.ListRow overflow="self" label={<Snippet />} />`, { imports: `import * as UI from "@impower/impower-ui/components";\nimport { Snippet } from "./Snippet";\n` }), []);
});

test("a form the check cannot resolve fails closed", () => {
  assert.deepEqual(run(`<ListRow label={<Clip />} />`, { head: `import { Clip } from "./index";\n` }), ["clips:fade"]);
  assert.deepEqual(run(`<ListRow label={<Tile label="x" />} />`, { imports: `import { ListRow, Tile } from "@impower/impower-ui/components";\n` }), ["label:fade", "component:not statically known"]);
  assert.deepEqual(run(`<ListRow label={row.node} />`, { head: `declare const row: { node: VNode };\n` }), ["label:fade"]);
  assert.deepEqual(run(`<ListRow label={make()} />`, { head: `declare function make(): VNode;\n` }), ["label:fade"]);
  assert.deepEqual(run(`<ListRow {...make()} />`, { head: `declare function make(): { label: VNode };\n` }), ["label:fade"]);
  assert.deepEqual(run(`<ListRow {...make()} />`, { head: `declare function make(): any;\n` }), ["label:not statically known"]);
  assert.deepEqual(run(`<ListRow label="a" {...make()} />`, { head: `declare function make(): any;\n` }), ["label:not statically known"]);
  assert.deepEqual(run(`<ListRow {...make()} label={<Snippet />} />`, { head: `declare function make(): { overflow: string };\n` }), ["clips:not statically known"]);
  assert.deepEqual(run(`<Mystery label={<b>a</b>} />`, { head: `declare const Mystery: any;\n` }), ["component:not statically known"]);
});

test("a self-clipping or unresolved label with overflow self or wrap passes, as do labels that do not clip", () => {
  assert.deepEqual(run(`<ListRow overflow="self" label={<Snippet text="a" />} />`), []);
  assert.deepEqual(run(`<ListRow overflow="wrap" label={<span class="truncate">a</span>} />`), []);
  assert.deepEqual(run(`<ListRow overflow={ok ? "self" : "wrap"} label={<Snippet text="a" />} />`, { head: `declare const ok: boolean;\n` }), []);
  assert.deepEqual(run(`<ListRow overflow={mode} label={<Snippet text="a" />} />`, { head: `declare const mode: "self" | "wrap";\n` }), []);
  assert.deepEqual(run(`<ListRow overflow={ok ? "self" : undefined} label={ok ? <span class="truncate">a</span> : "a"} />`, { head: `declare const ok: boolean;\n` }), []);
  assert.deepEqual(run(`<ListRow overflow="self" label={row.node} />`, { head: `declare const row: { node: VNode };\n` }), []);
  assert.deepEqual(run(`<ListRow {...props} />`, { head: `const props = { label: <span class="fade-edge">a</span>, overflow: "self" as const };\n` }), []);
  assert.deepEqual(run(`<ListRow {...props} overflow="self" />`, { head: `const props = { label: <span class="fade-edge">a</span> };\n` }), []);
  assert.deepEqual(run(`<ListRow label="A string" />`), []);
  assert.deepEqual(run(`<ListRow label={row.name} />`, { head: `declare const row: { name: string };\n` }), []);
  assert.deepEqual(run(`<ListRow label={name()} />`, { head: `declare function name(): string;\n` }), []);
  assert.deepEqual(run(`<ListRow {...select()} label="a" />`, { head: `declare function select(): { onClick: () => void };\n` }), []);
  assert.deepEqual(run(`<ListRow label={<Plain />} />`), []);
  assert.deepEqual(run(`<ListRow label={<Clip2 />} />`, { head: `import { Plain as Clip2 } from "./index";\n` }), []);
  assert.deepEqual(run(`<ListRow label={<span data-testid="truncate" aria-label="fade-edge">a line-clamp-2</span>} />`), []);
  assert.deepEqual(run(`<ListRow label={<b>a</b>} class="truncate" />`), []);
  assert.deepEqual(run(`<ListRow label={<Snippet />} />`, { file: "packages/other/src/Caller.tsx", imports: `import { ListRow } from "@impower/impower-ui/components";\nimport { Snippet } from "./Snippet";\n` }), []);
});

test("the repository's ListRow callers pass and the reported callers are discovered", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-listrow-overflow.mjs")], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, / 0 violation\(s\)/);
});
