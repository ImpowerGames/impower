// An alternator in a candidate's head whose `end` stands against the outer
// `|` (`match match(x) | a = 1 end| b = 2 end`) leaves the outer candidate
// the same reading the spaced spelling (`end | b`) gives it (I-1408): the
// head takes the `|`, with the first arm's key, as it takes the whitespace
// otherwise, so the candidate ends after its own arms' `end` and the code
// after it on the line is the code around it.
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { SyntaxNode } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { isTrivia } from "../../compiler/lint/luauTree";
import { ALTERNATOR_CANDIDATES, alternatorArms } from "../../compiler/utils/alternatorDecision";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { getParser } from "./grammarSnapshot";
import { Editor, expectParity, openRegistry } from "./incrementalParity";
import { compareEnginesFull, formatDivergences, vscodeScopeStacksPerChar } from "./scopeEquality";

const URI = "inmemory:///main.sd";

const run = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, output: ctx.story.ContinueMaximally() };
};

// The offsets of the compact spelling where the spaced one has a space: the
// `|` each `end` stands against.
const gapsOf = (compact: string): number[] => [...compact.matchAll(/\bend(?=\|)/g)].map((m) => m.index! + 3);
const spacedOf = (compact: string) => compact.replace(/\bend\|/g, "end |");
// Where the character at a compact offset stands in the spaced spelling,
// and where a range ending at a compact offset ends there.
const startIn = (gaps: number[], offset: number) => offset + gaps.filter((gap) => gap <= offset).length;
const endIn = (gaps: number[], offset: number) => (offset === 0 ? 0 : startIn(gaps, offset - 1) + 1);

const offsetAt = (text: string, position: { line: number; character: number }) => {
  const lines = text.split("\n");
  return lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character;
};

/** Every diagnostic a full compile reports, as offsets. */
const diagnosticsOf = (text: string) => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = c.compile({ textDocument: { uri: URI } } as never).program as any;
  return (program.diagnostics?.[URI] ?? [])
    .map((d: any) => ({
      from: offsetAt(text, d.range.start),
      to: offsetAt(text, d.range.end),
      severity: d.severity,
      message: typeof d.message === "string" ? d.message : d.message.value,
    }))
    .sort((a: any, b: any) => a.from - b.from || a.to - b.to || a.message.localeCompare(b.message));
};

/**
 * Each candidate's arms as `lowerArms` and `reportAlternatorValue` read
 * them: the first arm from the separator its head took, when it took one,
 * and each later one from its separator in the arms.
 */
const armsOf = (source: string): string[] => {
  const view: string[] = [];
  getParser().parse(source).iterate({
    enter: (ref) => {
      if (!ALTERNATOR_CANDIDATES.has(ref.name)) return;
      const armsNode = alternatorArms(ref.node);
      // The separator the head took, read from the tree as written.
      let head = ref.node.getChild(`${ref.name}_content`)?.firstChild ?? null;
      while (head && !/AlternatorLineStartHead$|AlternatorHead$/.test(head.name)) head = head.nextSibling;
      const headEnd = head?.getChild(`${head.name}_end`) ?? null;
      const found = headEnd ? getDescendent("LuauAlternatorSeparator", headEnd) : undefined;
      // `getDescendent` also visits a node that begins where its parent ends.
      const lead = found && headEnd && found.to <= headEnd.to ? found : null;
      if (!armsNode && !lead) return void view.push("none");
      const arms: string[] = [];
      const open = (separator: SyntaxNode) => {
        const key = getDescendent("LuauAlternatorAssignmentName", separator);
        arms.push(key ? `${source.slice(key.from, key.to)} =` : "");
      };
      if (lead) open(lead);
      const content = armsNode?.getChild(`${armsNode.name}_content`) ?? null;
      for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
        if (child.name === "LuauAlternatorSeparator") open(child);
        else if (!isTrivia(child) && arms.length > 0) arms[arms.length - 1] += ` ${source.slice(child.from, child.to).trim()}`;
      }
      view.push(arms.map((arm) => arm.trim()).join(" | "));
    },
  });
  return view;
};

const semanticsOf = (text: string) => {
  const registry = new SparkdownDocumentRegistry(["semantics"]);
  registry.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const tokens: { from: number; to: number; type: string }[] = [];
  for (const cur = registry.annotations(URI)!.semantics.iter(); cur.value; cur.next()) {
    tokens.push({ from: cur.from, to: cur.to, type: JSON.stringify(cur.value.type) });
  }
  return tokens;
};

// Each form in its compact spelling, the story's output (base's for the
// spaced spelling, which this change leaves as it was), and its arms. Since
// I-1284 and I-1397, an alternator Luau code uses as a value (a condition, a
// declaration's value, a table field) or writes as a statement runs as a
// displayed one does: it gives its selected arm's value, nil for an empty
// arm, and runs that arm's calls.
const FORMS: [string, string, string, string[]][] = [
  [
    "a function body's local, with a statement after it",
    'function f()\n  local v = match match("x") | x = "mage" end| mage = "yes" end local after = 7\n  return after\nend\n\nscene start\n  Value {f()}.\nend\n',
    "Value 7.\n",
    ['mage = "yes"', 'x = "mage"'],
  ],
  [
    "a function value whose end stands against the bar",
    "function f()\n  match function() return 1 end| other = print(2) end local after = 7\n  return after\nend\n\nscene start\n  Value {f()}.\nend\n",
    "Value 27.\n",
    ["other = print(2)"],
  ],
  ["story braces, with a keyed first arm", 'scene start\n  Value {match match("x") | x = "mage" end| mage = "yes" end}.\nend\n', "Value yes.\n", ['mage = "yes"', 'x = "mage"']],
  ["story braces, with an unkeyed first arm", 'scene start\n  Value {cycle match("x") | x = "a" end| "b" end}.\nend\n', "Value b.\n", ['"b"', 'x = "a"']],
  ["story braces, with no space after the bar", 'scene start\n  Value {cycle match("x") | x = "a" end|"b" end}.\nend\n', "Value b.\n", ['"b"', 'x = "a"']],
  [
    "story braces, nested twice",
    'scene start\n  Value {cycle cycle match("x") | x = "a" end| "b" end| "c" end}.\nend\n',
    "Value c.\n",
    ['"c"', '"b"', 'x = "a"'],
  ],
  ["a store's value", 'store s = cycle match("x") | x = "a" end| "b" end\n\nscene start\n  Value {s}.\nend\n', "Value b.\n", ['"b"', 'x = "a"']],
  ["a narrative statement's local, in the bounded rules", 'scene start\n  & local v = match match("x") | x = 1 end| mage = 2 end\n  Done.\nend\n', "Done.\n", ["mage = 2", "x = 1"]],
  [
    "a story if's condition, in the bounded rules",
    'scene start\n  if cycle match("x") | x = "a" end| "b" end == "b" then\n    Yes.\n  end\n  After.\nend\n',
    "Yes.\nAfter.\n",
    ['"b"', 'x = "a"'],
  ],
  [
    "a block form whose arms go on below",
    'function f()\n  match match("x") | x = print(1) end| mage = print(2)\n    | other = print(3)\n  end\n  return 3\nend\n\nscene start\n  Value {f()}.\nend\n',
    "Value 133.\n",
    ["mage = print(2) | other = print(3)", "x = print(1)"],
  ],
  // An empty arm right after the separator the head took: the candidate's
  // end does not read the arm's `end` as a closer, nor end at its line, before
  // its arms open (round 1, review comment 6340004336).
  ["story braces, with an empty unkeyed arm", 'scene start\n  Value {cycle match("x") | x = "a" end| end}.\nend\n', "Value .\n", ["", 'x = "a"']],
  ["story braces, with an empty keyed arm", 'scene start\n  Value {match match("x") | x = "a" end|other= end}.\nend\n', "Value .\n", ["other =", 'x = "a"']],
  ["story braces, with an empty arm against its end", 'scene start\n  Value {cycle match("x") | x = "a" end|end}.\nend\n', "Value .\n", ["", 'x = "a"']],
  [
    "a block form with an empty arm at its line's end",
    'function f()\n  match match("x") | x = print(1) end|\n    | other = print(3)\n  end\n  return 3\nend\n\nscene start\n  Value {f()}.\nend\n',
    "Value 133.\n",
    [" | other = print(3)", "x = print(1)"],
  ],
  ["a narrative statement's local with an empty arm, in the bounded rules", 'scene start\n  & local v = match match("x") | x = 1 end| end\n  Done.\nend\n', "Done.\n", ["", "x = 1"]],
  // An empty last arm before a closer, a separator or the bounded line's end,
  // with no `end`: the candidate ends there and its head's separator is its
  // one arm (`headSeparator`).
  ["story braces, with an empty arm before the brace's end", 'scene start\n  Value {cycle match("x") | x = "a" end|}.\nend\n', "Value .\n", ["", 'x = "a"']],
  [
    "a parenthesized value with an empty arm before its closer",
    'function f()\n  return (cycle match("x") | x = "a" end|)\nend\n\nscene start\n  Value {f()}.\nend\n',
    "Value nil.\n",
    ["", 'x = "a"'],
  ],
  [
    "a table field with an empty arm before its separator",
    'function f()\n  local t = { cycle match("x") | x = "a" end|, 2 }\n  return #t\nend\n\nscene start\n  Value {f()}.\nend\n',
    // The table is `{ nil, 2 }`, whose length Luau reads as 2 (I-1502).
    "Value 0.\n",
    ["", 'x = "a"'],
  ],
  [
    "a branch keyword after an empty arm",
    'function f(c)\n  if c then local v = cycle match("x") | x = "a" end| else end\n  return 3\nend\n\nscene start\n  Value {f(true)}.\nend\n',
    "Value 3.\n",
    ["", 'x = "a"'],
  ],
  ["a narrative statement's local with an empty arm at its line's end", 'scene start\n  & local v = match match("x") | x = 1 end|\n  Done.\nend\n', "Done.\n", ["", "x = 1"]],
  // The bounded arms end before a branch keyword or `until`, as the Luau
  // arms do (round 2, review comment 6340950796).
  ["a bounded `else` after an empty arm", 'scene start\n  & if true then local v = cycle match("x") | x = "a" end|else end\n  Done.\nend\n', "Done.\n", ["", 'x = "a"']],
  ["a bounded `elseif` after an empty arm", 'scene start\n  & if true then local v = cycle match("x") | x = "a" end|elseif false then end\n  Done.\nend\n', "Done.\n", ["", 'x = "a"']],
  ["a bounded `until` after an empty arm", 'scene start\n  & repeat local v = cycle match("x") | x = "a" end|until true\n  Done.\nend\n', "Done.\n", ["", 'x = "a"']],
  ["a reading error in the first arm", 'scene start\n  Value {cycle match("x") | x = "a" end| "b" .. end}.\nend\n', "Value b.\n", ['"b" ..', 'x = "a"']],
];

describe("a nested alternator whose end stands against the outer bar reads as the spaced spelling (I-1408)", () => {
  describe.each(FORMS)("%s", (_, compact, output, arms) => {
    const spaced = spacedOf(compact);
    const gaps = gapsOf(compact);

    test("the story prints what the spaced spelling prints", () => {
      expect(run(compact)).toEqual(run(spaced));
      expect(run(compact).output).toBe(output);
    });

    test("the arms are the spaced spelling's", () => {
      expect(armsOf(compact)).toEqual(arms);
      expect(armsOf(spaced)).toEqual(arms);
    });

    test("the diagnostics are the spaced spelling's, at the same text", () => {
      const moved = diagnosticsOf(compact).map((d: any) => ({ ...d, from: startIn(gaps, d.from), to: endIn(gaps, d.to) }));
      expect(moved).toEqual(diagnosticsOf(spaced));
    });

    test("both engines agree on both spellings", async () => {
      for (const source of [compact, spaced]) {
        const result = await compareEnginesFull(source);
        expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
      }
    });

    test("the editor's scopes and semantic tokens are the spaced spelling's", async () => {
      const compactScopes = await vscodeScopeStacksPerChar(compact);
      const spacedScopes = await vscodeScopeStacksPerChar(spaced);
      for (let i = 0; i < compact.length; i++) {
        if (compact[i] === "\n") continue;
        expect(compactScopes[i], `${JSON.stringify(compact[i])} at ${i}`).toEqual(spacedScopes[startIn(gaps, i)]);
      }
      const moved = semanticsOf(compact).map((t) => ({ ...t, from: startIn(gaps, t.from), to: endIn(gaps, t.to) }));
      expect(moved).toEqual(semanticsOf(spaced));
    });

    test("removing and restoring the space keeps cold equal to incremental", () => {
      const editor = new Editor(openRegistry(URI, spaced), URI, spaced);
      for (const gap of [...gaps].reverse()) {
        const at = startIn(gaps.filter((g) => g < gap), gap);
        editor.replace(at, at + 1, "");
        expectParity(editor.registry, URI, editor.text, `space before offset ${gap} removed`);
      }
      expect(editor.text).toBe(compact);
      for (const gap of [...gaps].reverse()) {
        editor.replace(gap, gap, " ");
        expectParity(editor.registry, URI, editor.text, `space before offset ${gap} restored`);
      }
      expect(editor.text).toBe(spaced);
    });
  });

  test("each error of the first arm's reading is reported once", () => {
    const source = FORMS.find(([label]) => label === "a reading error in the first arm")![1];
    const errors = diagnosticsOf(source).filter((d: any) => d.severity === 1);
    expect(errors.map((d: any) => `${source.slice(d.from, d.to)}: ${d.message}`)).toEqual([
      // The head the separator ends is no value (I-1446), reported once.
      'match("x") | x = "a" end: A `cycle` takes no value before its first `|`; write its arms as `| ...`',
      "..: Expected identifier when parsing expression, got '..'",
      "end: Expected identifier when parsing expression, got 'end'",
    ]);
  });
});
