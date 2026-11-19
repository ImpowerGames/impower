import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseSource } from "./grammarSnapshot";
import { vscodeScopeStacksPerChar } from "./scopeEquality";

const MISSING = "Missing ')' to close the selector's parameter list";

function diagnose(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script" as const,
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const out: string[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      const message = typeof d.message === "string" ? d.message : (d.message?.value ?? "");
      out.push(`${d.range?.start?.line}:${d.range?.start?.character}-${d.range?.end?.character} ${message}`);
    }
  }
  return out;
}

const PREFIX = "style card {\n  ";

const style = (key: string) => `${PREFIX}${key} {\n    color = red\n  }\n}\n`;

const COMPONENT_NODES = new Set(["CustomComponentName", "BuiltinComponentName"]);

const COMPONENT_SCOPES = ["entity.name.type.class.view.sd", "keyword.other.component.builtin.name.sd"];

function treeLeaves(key: string): [name: string, text: string][] {
  const source = style(key);
  const from = PREFIX.length;
  const to = from + key.length;
  const leaves: [string, string][] = [];
  parseSource(source).iterate({
    from,
    to,
    enter: (node) => {
      if (node.from < from || node.to > to || node.from === node.to) return;
      if (!node.node.firstChild) leaves.push([node.name, source.slice(node.from, node.to)]);
    },
  });
  return leaves;
}

const componentWords = (key: string) =>
  treeLeaves(key)
    .filter(([name]) => COMPONENT_NODES.has(name))
    .map(([, text]) => text);

const errorLeaves = (key: string) =>
  treeLeaves(key).filter(([name]) => name.startsWith("ERROR_") || name.includes("Comment"));

const misreadScope = (scope: string) =>
  COMPONENT_SCOPES.includes(scope) ||
  scope.startsWith("invalid.") ||
  scope.startsWith("comment.") ||
  scope.includes(".comment.");

async function vscodeComponentOrInvalidChars(key: string): Promise<string> {
  const source = style(key);
  const stacks = await vscodeScopeStacksPerChar(source);
  let flagged = "";
  for (let i = PREFIX.length; i < PREFIX.length + key.length; i++) {
    if ((stacks[i] ?? []).some(misreadScope)) {
      flagged += source[i];
    }
  }
  return flagged;
}

const RAW_CSS_KEYS = [
  "@media (min-width: sm)",
  "@supports (display: grid)",
  "@container (min-width: 1px)",
  "@media screen and (min-width: 1px)",
  "@supports not (display: grid)",
  "@media(100px>width)",
  "@media (min-width: sm) and (max-width: md)",
  "@layer base, theme",
  "@container sidebar (min-width: 400px)",
  "@container style(--shape: selector(card))",
  "@supports (--shape: selector(card))",
  "@container style(--shape: @hover)",
  "@supports (color: #fff)",
  "@container style(--label: 'width: sm )')",
  "@container style(--tint: #0af)",
  "@supports (--shape: fn(selector(card)))",
  "&:where(label)",
  "&:where(:not(label))",
  "&:is(label, input)",
];

const SELECTOR_LIST_KEYS: [key: string, components: string[]][] = [
  ["@scope (card) to (icon)", ["card", "icon"]],
  ["@supports selector(card)", ["card"]],
  ["@supports (display: grid) and selector(card)", ["card"]],
  ["@supports not (selector(card))", ["card"]],
  ["@supports ((display: grid) and selector(card))", ["card"]],
  ["@is(card, icon)", ["card", "icon"]],
];

describe("raw CSS in a style block's selector key (I-2556)", () => {
  describe("is not coloured as component names in the tree", () => {
    for (const key of RAW_CSS_KEYS) {
      test(key, () => {
        expect(componentWords(key)).toEqual([]);
        expect(errorLeaves(key)).toEqual([]);
      });
    }
  });

  describe("is not coloured as component names in VS Code", () => {
    for (const key of RAW_CSS_KEYS) {
      test(key, async () => {
        expect(await vscodeComponentOrInvalidChars(key)).toBe("");
      });
    }
  });

  test("colours only the class name of a written class inside a raw pseudo-class", async () => {
    const key = "> :where(.control)";
    expect(componentWords(key)).toEqual([]);
    expect(errorLeaves(key)).toEqual([]);
    expect(treeLeaves(key)).toContainEqual(["LuauSparkleClassName", "control"]);
    expect(await vscodeComponentOrInvalidChars(key)).toBe("control");
  });

  describe("keeps component names where the writers read a selector list", () => {
    for (const [key, components] of SELECTOR_LIST_KEYS) {
      test(key, async () => {
        expect(componentWords(key)).toEqual(components);
        expect(errorLeaves(key)).toEqual([]);
        expect(await vscodeComponentOrInvalidChars(key)).toBe(components.join(""));
      });
    }
  });

  test.each([
    ["@media(min-width: sm", "1:8-9"],
    ["@media (min-width: sm", "1:9-10"],
    ["@supports (display: grid", "1:12-13"],
    ["@supports (display: grid) and (selector(card)", "1:32-33"],
    ["@supports selector(card", "1:20-21"],
  ])("reports the unclosed prelude group of %s at its paren", (key, range) => {
    expect(diagnose(style(key))).toContain(`${range} ${MISSING}`);
  });

  test("closed raw CSS and selector lists report no selector problem", () => {
    const selectorProblem = /Missing '\)'|is not a known state|needs its arguments|takes no arguments/;
    for (const key of [...RAW_CSS_KEYS, ...SELECTOR_LIST_KEYS.map(([selector]) => selector)]) {
      expect(diagnose(style(key)).filter((d) => selectorProblem.test(d)), key).toEqual([]);
    }
  });
});
