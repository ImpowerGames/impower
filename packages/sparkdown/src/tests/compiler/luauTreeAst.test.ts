// The AST `readLuauAst.ts` reads from Sparkdown's syntax tree must be the AST
// Luau's parser reads from the same Luau (#1285, the second check of #1283).
//
// Luau's parser here is the TypeScript port in `DefinitionParser.ts`, the
// oracle: the converter does not use it. Both ASTs are printed through one
// canonical printer that omits locations (`printAst`), and the texts must be
// equal:
// - for every Luau fixture `luauFixtures.ts` finds, except the inputs on
//   which the two disagree about having a syntax error (#1284's list) and
//   those on `KNOWN_STRUCTURAL_DISAGREEMENTS` below. A `.sd` fixture's units
//   are compared with Luau's reading of the text the type checker extracted
//   for each before it read the tree (`luauCheckerText.ts`), Sparkdown's own
//   constructs printed as that text reads them (`luauCheckerView.ts`); a
//   conformance file's `run`
//   function with Luau's reading of the file itself. A unit in which either
//   side finds a syntax error is compared on having one: the AST of a
//   recovery is a side effect of how each reader recovers;
// - for generated expressions covering every operator in Luau's precedence
//   table, every pair of binary operators, every call form and its sugar,
//   indexing, method calls, tables, functions, `if` expressions,
//   interpolated strings and the literals' spellings.
// Every node's location must also equal the parser's, mapped to the
// document by `textDocumentPosition`, over statements in their one-line and
// multi-line forms. Sparkdown's own constructs have fixtures of their own.
//
// A disagreement that stops happening fails its test, so the fix for an
// issue removes its entry in the fix's own pull request.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  AstExprGlobal,
  AstStatFunction,
  isSparkdownNode,
  visitAst,
  type AstNode,
  type AstVisitor,
} from "../../compiler/typecheck/Ast";
import { parseLuau } from "../../compiler/typecheck/DefinitionParser";
import { checkerTextUnits, textDocumentPosition, type LuauTextUnit } from "./luauCheckerText";
import { printAst } from "../../compiler/typecheck/printAst";
import { readLuauExpression, readLuauRunFile, readLuauUnits, statementAt, type LuauAstUnit } from "../../compiler/typecheck/readLuauAst";
import { runWrapperText } from "../../compiler/utils/runWrapper";
import { parseSource } from "./grammarSnapshot";
import { checkerView, NoCheckerView } from "./luauCheckerView";
import { KNOWN_DISAGREEMENTS, luauInputs, type LuauInput } from "./luauFixtures";
import { expressionDocument, generatedExpressions } from "./luauGeneratedExpressions";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface StructuralDisagreement {
  /** A fixture as `luauInputs` names it, or a generated expression as written. */
  input: string;
  /** The open issue that explains it. */
  issue: number;
  reason: string;
}

// Inputs both sides read without a syntax error, but differently: the
// grammar reads Luau's tokens another way than Luau does.
const KNOWN_STRUCTURAL_DISAGREEMENTS: StructuralDisagreement[] = [
  {
    input: "f [==[s]==]",
    issue: 1255,
    reason: "the grammar reads a long string with `=` signs after a callee and a space as an index",
  },
  {
    input: "a :: number? | string",
    issue: 877,
    reason: "the grammar reads a cast's target as a value, so the `?` ends the Luau",
  },
];

const syntaxKnown = new Set(KNOWN_DISAGREEMENTS.map((entry) => entry.fixture));
const structuralKnown = new Map(KNOWN_STRUCTURAL_DISAGREEMENTS.map((entry) => [entry.input, entry]));

/** The first line at which two printed trees differ, with a few lines around it from each. */
function firstDifference(luau: string, tree: string): string {
  const a = luau.split("\n");
  const b = tree.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      const around = (lines: string[]) => lines.slice(Math.max(0, i - 3), i + 4).join("\n    ");
      return `at printed line ${i + 1}\n  Luau's parser:\n    ${around(a)}\n  the tree:\n    ${around(b)}`;
    }
  }
  return "";
}

/** Compares a reading of the tree with Luau's, returning the differences found; none when they agree. */
function compareUnit(label: string, luauRoot: AstNode, luauErrors: number, unit: LuauAstUnit, tree: AstNode, view: Parameters<typeof printAst>[1]): string[] {
  if (luauErrors > 0 || unit.errors.length > 0) {
    if (luauErrors > 0 !== unit.errors.length > 0) {
      return [`${label}: Luau's parser finds ${luauErrors} syntax errors, the tree ${unit.errors.length} (${unit.errors.map((e) => `${e.location.begin} ${e.message}`).join("; ")})`];
    }
    return [];
  }
  const a = printAst(luauRoot);
  let b: string;
  try {
    b = printAst(tree, view);
  } catch (error) {
    if (error instanceof NoCheckerView) return [`${label}: the checker's text has no reading of ${error.message}`];
    throw error;
  }
  return a === b ? [] : [`${label}: ${firstDifference(a, b)}`];
}

/** The differences between the tree's reading of a fixture and Luau's. */
function fixtureDifferences(input: LuauInput): string[] {
  const tree = parseSource(input.text);
  const units = readLuauUnits(tree, input.text);
  if (input.luau !== undefined) {
    const parsed = parseLuau(input.luau);
    const run = units.prelude.root.body.find((s) => s instanceof AstStatFunction && s.name instanceof AstExprGlobal && s.name.name === "run");
    if (!run && units.prelude.errors.length === 0) return ["the tree has no `run` function"];
    return compareUnit("run", parsed.root.body[0] ?? parsed.root, parsed.errors.length, units.prelude, run ?? units.prelude.root, checkerView(input.text, "_G"));
  }
  const extracted = checkerTextUnits(tree, input.text);
  const theirs: LuauTextUnit[] = [extracted.prelude, ...extracted.flows];
  const ours = [units.prelude, ...units.flows];
  if (theirs.length !== ours.length) return [`the type checker extracts ${theirs.length} units, the tree reads ${ours.length}`];
  return theirs.flatMap((unit, i) => {
    const parsed = parseLuau(unit.text);
    const ourUnit = ours[i]!;
    return compareUnit(`${unit.kind} unit ${i}`, parsed.root, parsed.errors.length, ourUnit, ourUnit.root, checkerView(input.text, extracted.anyName));
  });
}

describe("The AST read from the syntax tree is the AST Luau's parser reads", () => {
  const inputs = luauInputs().filter((input) => !syntaxKnown.has(input.name));

  test("finds the fixtures and lists each known structural disagreement once", () => {
    expect(inputs.some((input) => input.name.startsWith("grammar/"))).toBe(true);
    expect(inputs.some((input) => input.name.startsWith("conformance/"))).toBe(true);
    const names = new Set([...inputs.map((input) => input.name), ...generatedExpressions().map((g) => g.expression)]);
    expect(KNOWN_STRUCTURAL_DISAGREEMENTS.filter((entry) => !names.has(entry.input)).map((entry) => entry.input)).toEqual([]);
    expect(structuralKnown.size).toBe(KNOWN_STRUCTURAL_DISAGREEMENTS.length);
  });

  for (const input of inputs) {
    test(input.name, () => {
      const differences = fixtureDifferences(input);
      const entry = structuralKnown.get(input.name);
      if (entry) {
        expect(differences.length, `${input.name} now reads as Luau reads it. Remove its entry (#${entry.issue}) from KNOWN_STRUCTURAL_DISAGREEMENTS.`).toBeGreaterThan(0);
      } else {
        expect(differences, `${input.name}: the tree's AST differs from Luau's parser's`).toEqual([]);
      }
    }, 120_000);
  }

  const groups = new Map<string, string[]>();
  for (const { group, expression } of generatedExpressions()) groups.set(group, [...(groups.get(group) ?? []), expression]);
  for (const [group, expressions] of groups) {
    test(`generated: ${group} (${expressions.length} expressions)`, () => {
      const failures: string[] = [];
      const fixed: string[] = [];
      for (const expression of expressions) {
        const text = expressionDocument(expression);
        const units = readLuauUnits(parseSource(text), text);
        const parsed = parseLuau(text);
        const differences = [
          ...(parsed.errors.length ? [`Luau's parser finds a syntax error: ${parsed.errors[0]!.message}`] : []),
          ...(units.flows.length ? ["the tree reads a flow"] : []),
          ...compareUnit("expression", parsed.root, parsed.errors.length, units.prelude, units.prelude.root, undefined),
        ];
        const entry = structuralKnown.get(expression);
        if (entry && differences.length === 0) fixed.push(`${JSON.stringify(expression)} (#${entry.issue})`);
        if (!entry && differences.length > 0) failures.push(`${JSON.stringify(expression)}\n${differences.join("\n")}`);
      }
      expect(fixed, "These now read as Luau reads them; remove their entries from KNOWN_STRUCTURAL_DISAGREEMENTS.").toEqual([]);
      expect(failures).toEqual([]);
    }, 120_000);
  }
});

/** Every node of a tree, in `visitAst`'s order, leaving out the `&` that marks a statement, which Luau's parser does not see. */
function nodesOf(root: AstNode): AstNode[] {
  const nodes: AstNode[] = [];
  visitAst(root, { visit: (node) => (node.kind === "SparkdownExplicit" || nodes.push(node), true) });
  return nodes;
}

function range(begin: { line: number; column?: number; character?: number }, end: { line: number; column?: number; character?: number }): string {
  return `${begin.line}:${begin.character ?? begin.column}-${end.line}:${end.character ?? end.column}`;
}

/** Each node's document range from the tree, beside the parser's range mapped to the document, where they differ. */
function locationDifferences(text: string, pick: (units: { prelude: LuauTextUnit; flows: LuauTextUnit[] }) => LuauTextUnit, pickOurs: (units: ReturnType<typeof readLuauUnits>) => LuauAstUnit): string[] {
  const tree = parseSource(text);
  const unit = pick(checkerTextUnits(tree, text));
  const parsed = parseLuau(unit.text);
  const ours = pickOurs(readLuauUnits(tree, text));
  expect(parsed.errors).toEqual([]);
  expect(ours.errors).toEqual([]);
  const theirs = nodesOf(parsed.root);
  const mine = nodesOf(ours.root);
  expect(mine.map((n) => n.kind)).toEqual(theirs.map((n) => n.kind));
  const lines = text.split("\n");
  return theirs.flatMap((node, i) => {
    const expected = range(textDocumentPosition(unit, node.location.begin), textDocumentPosition(unit, node.location.end));
    const actual = range(mine[i]!.location.begin, mine[i]!.location.end);
    return expected === actual ? [] : [`${node.kind} on ${JSON.stringify(lines[node.location.begin.line] ?? "")}: Luau ${expected}, tree ${actual}`];
  });
}

describe("Each node's location is the parser's, in the document", () => {
  test("statements in their one-line and multi-line forms", () => {
    const text = [
      "function g(a, b, ...)",
      "  if a then b = 1 elseif b then b = 2 else b = 3 end",
      "  if a then",
      "    b = 1",
      "  elseif b then",
      "    b = 2",
      "  else",
      "    b = 3",
      "  end",
      "  local function h(x: number): number return x * 2 end",
      "  local f = function(y)",
      "    return y",
      "  end",
      "  function t.m(self, z) return z end",
      "  function t:n(z)",
      "    return self, z",
      "  end",
      "  local u = { 1, k = 2, [3] = 4 }",
      "  local v = {",
      "    1,",
      "    k = 2,",
      "    [a] = { b },",
      "  }",
      '  local w = a.b:c(1):d("s").e[2]',
      "  local q = a",
      "    .b",
      "    :c(1)",
      "    :d { k = 1 }",
      "  for i = 1, 10, 2 do b = i end",
      "  for k, v2 in pairs(u) do",
      "    b = k .. v2",
      "  end",
      "  while a do break end",
      "  repeat b = b - 1 until b < 0",
      "  do local r = 1 end",
      "  b += 1",
      "  local s = `x{a}y{b + 1}`",
      "  local c: { [string]: number }? = nil",
      "  return a and not b or #u, ...",
      "end",
      "",
    ].join("\n");
    expect(locationDifferences(text, (units) => units.prelude, (units) => units.prelude)).toEqual([]);
  });

  test("statements in a scene, with characters that take more than one UTF-8 byte", () => {
    const text = [
      "scene s(n: number)",
      "  Hello.",
      '  & local s = "é😀" .. n',
      "  if n > 1 then",
      "    & n = n - 1",
      "  end",
      "  Bye {n}.",
      '  local t = { a = "é", b = n }',
      "end",
      "",
    ].join("\n");
    expect(locationDifferences(text, (units) => units.flows[0]!, (units) => units.flows[0]!)).toEqual([]);
  });
});

describe("Sparkdown's own constructs", () => {
  const text = [
    "define Penguin with",
    '  name = "p"',
    "end",
    "& x = -> elsewhere.part",
    "& r = @/a+b/gi",
    "& p = new Penguin(1, 2).name",
    "& q = new Penguin",
    '& s = `Hi {{shout}} {cycle|"a"|"b"}!`',
    '& d = "Val: {{fmt(1)}} {x}"',
    "store a, b: number = 1, 2",
    "",
    "scene one(k: number)",
    "  local n = k",
    "  choose",
    "    + [A]",
    "      n = 2",
    "    + [B]",
    "      & n = 3",
    "  then",
    "    n = n + 1",
    "  end",
    "  branch inner(m, w: string)",
    "    & n = m",
    "  end",
    "end",
    "",
  ].join("\n");
  const tree = parseSource(text);
  const units = readLuauUnits(tree, text);

  test("each is read as its own class", () => {
    expect(units.prelude.errors).toEqual([]);
    expect(printAst(units.prelude.root)).toBe(
      [
        "StatBlock",
        "  SparkdownExplicit",
        "    StatAssign",
        "      ExprGlobal x",
        "      =",
        '      SparkdownDivertTarget "elsewhere.part"',
        "  SparkdownExplicit",
        "    StatAssign",
        "      ExprGlobal r",
        "      =",
        '      SparkdownRegex "a+b" "gi"',
        "  SparkdownExplicit",
        "    StatAssign",
        "      ExprGlobal p",
        "      =",
        "      ExprIndexName .name",
        "        SparkdownNew Penguin call",
        "          ExprConstantNumber 1",
        "          ExprConstantNumber 2",
        "  SparkdownExplicit",
        "    StatAssign",
        "      ExprGlobal q",
        "      =",
        "      SparkdownNew Penguin",
        "  SparkdownExplicit",
        "    StatAssign",
        "      ExprGlobal s",
        "      =",
        '      ExprInterpString "Hi " " " "!"',
        "        SparkdownCallShorthand",
        "          ExprGlobal shout",
        "        SparkdownSequentialAlternator LuauSequentialAlternatorBlock",
        "  SparkdownExplicit",
        "    StatAssign",
        "      ExprGlobal d",
        "      =",
        '      SparkdownInterpString "Val: " " " ""',
        "        SparkdownCallShorthand",
        "          ExprCall",
        "            ExprGlobal fmt",
        "            ExprConstantNumber 1",
        "        ExprGlobal x",
        "  SparkdownStore =",
        "    ExprGlobal a",
        "    ExprGlobal b",
        "      TypeReference number",
        "    ExprConstantNumber 1",
        "    ExprConstantNumber 2",
      ].join("\n"),
    );
    expect(units.flows).toHaveLength(1);
    expect(units.flows[0]!.errors).toEqual([]);
    expect(printAst(units.flows[0]!.root)).toBe(
      [
        "StatBlock",
        "  StatLocalFunction",
        "    local __flow#0 function=0 loop=0",
        '    ExprFunction "__flow" depth=1 parens',
        "      local k#1 function=1 loop=0",
        "        TypeReference number",
        "      StatBlock",
        "        StatLocal =",
        "          ExprLocal k#1",
        "          local n#2 function=1 loop=0",
        "        SparkdownChoose",
        "          StatBlock",
        "            StatAssign",
        "              ExprLocal n#2",
        "              =",
        "              ExprConstantNumber 2",
        "            SparkdownExplicit",
        "              StatAssign",
        "                ExprLocal n#2",
        "                =",
        "                ExprConstantNumber 3",
        "          then",
        "            StatBlock",
        "              StatAssign",
        "                ExprLocal n#2",
        "                =",
        "                ExprBinary +",
        "                  ExprLocal n#2",
        "                  ExprConstantNumber 1",
        "        StatLocal =",
        "          SparkdownFlowArgument",
        "          SparkdownFlowArgument",
        "          local m#3 function=1 loop=0",
        "          local w#4 function=1 loop=0",
        "            TypeReference string",
        "        SparkdownExplicit",
        "          StatAssign",
        "            ExprLocal n#2",
        "            =",
        "            ExprLocal m#3",
      ].join("\n"),
    );
  });

  test("a narrative interpolation's alternators are read as expressions", () => {
    const narrative = ': {match x|"a"|"b"} and {queue|"a"|"b"}\n';
    const printed: string[] = [];
    const cursor = parseSource(narrative).cursor();
    do {
      if (cursor.name === "LuauInterpolatedStringExpression") {
        const inner = [];
        for (let child = cursor.node.firstChild; child; child = child.nextSibling) inner.push(child);
        const { expr, errors } = readLuauExpression(inner.slice(1, -1), narrative);
        expect(errors).toEqual([]);
        printed.push(printAst(expr));
      }
    } while (cursor.next());
    expect(printed).toEqual(["SparkdownConditionalAlternator LuauConditionalAlternatorBlock", "SparkdownSequentialAlternator LuauSequentialAlternatorBlock"]);
  });

  test("a visitor's method for each construct sees it, and a visitor without them sees it and its children through visit", () => {
    const seen: string[] = [];
    const record = (node: AstNode) => {
      seen.push(node.kind);
      return true;
    };
    const visitor: Required<AstVisitor> = {
      visit: () => true,
      visitSparkdownDivertTarget: record,
      visitSparkdownRegex: record,
      visitSparkdownConditionalAlternator: record,
      visitSparkdownSequentialAlternator: record,
      visitSparkdownNew: record,
      visitSparkdownCallShorthand: record,
      visitSparkdownInterpString: record,
      visitSparkdownFlowArgument: record,
      visitSparkdownExplicit: record,
      visitSparkdownStore: record,
      visitSparkdownChoose: record,
    };
    for (const unit of [units.prelude, ...units.flows]) visitAst(unit.root, visitor);
    expect(new Set(seen)).toEqual(
      new Set([
        "SparkdownDivertTarget",
        "SparkdownRegex",
        "SparkdownSequentialAlternator",
        "SparkdownNew",
        "SparkdownCallShorthand",
        "SparkdownInterpString",
        "SparkdownFlowArgument",
        "SparkdownExplicit",
        "SparkdownStore",
        "SparkdownChoose",
      ]),
    );
    // A plain visitor reaches the Luau inside each construct.
    const kinds: string[] = [];
    visitAst(units.prelude.root, { visit: (node) => (kinds.push(isSparkdownNode(node) ? `*${node.kind}` : node.kind), true) });
    expect(kinds).toContain("*SparkdownCallShorthand");
    expect(kinds.filter((k) => k === "ExprConstantNumber")).toHaveLength(5);
  });

  test("each statement names the tree nodes it was read from", () => {
    const flow = units.flows[0]!;
    expect(flow.statements.map((s) => [s.statement.kind, s.nodes.map((n) => n.name)])).toEqual([
      ["StatLocal", ["LuauSparkdownVariableDefinition"]],
      ["SparkdownChoose", ["LuauSparkdownChooseBlock"]],
      ["StatLocal", ["Branch"]],
      ["SparkdownExplicit", ["LuauExplicitStatement"]],
    ]);
    const choose = flow.statements[1]!.nodes[0]!;
    expect(statementAt(flow, choose)).toBe(flow.statements[1]!.statement);
    expect(units.prelude.statements.map((s) => s.nodes.map((n) => text.slice(n.from, n.to).split("\n")[0]))).toEqual([
      ["& x = -> elsewhere.part"],
      ["& r = @/a+b/gi"],
      ["& p = new Penguin(1, 2).name"],
      ["& q = new Penguin"],
      ['& s = `Hi {{shout}} {cycle|"a"|"b"}!`'],
      ['& d = "Val: {{fmt(1)}} {x}"'],
      ["store a, b: number = 1, 2"],
    ]);
  });
});

describe("Unfinished and boundary input", () => {
  /** The prelude's errors as `line:character message`, from the tree, and from Luau's parser mapped to the document. */
  function preludeErrors(text: string): { tree: string[]; luau: string[] } {
    const tree = parseSource(text);
    const unit = checkerTextUnits(tree, text).prelude;
    const ours = readLuauUnits(tree, text).prelude;
    return {
      tree: ours.errors.map((e) => `${e.location.begin.line}:${e.location.begin.column} ${e.message}`),
      luau: parseLuau(unit.text).errors.map((e) => {
        const at = textDocumentPosition(unit, e.location.begin);
        return `${at.line}:${at.character} ${e.message}`;
      }),
    };
  }

  test("nesting past Luau's recursion limit is Luau's error, not an exception", () => {
    for (const [operators, limited] of [
      [100, false],
      [1200, true],
      [10000, true],
    ] as const) {
      const { tree, luau } = preludeErrors(`local x = ${"1 ^ ".repeat(operators)}1\n`);
      const expected = limited ? ["Exceeded allowed recursion depth; simplify your expression to make the code compile"] : [];
      expect(luau.map((e) => e.replace(/^\S+ /, ""))).toEqual(expected);
      expect(tree.map((e) => e.replace(/^\S+ /, ""))).toEqual(expected);
    }
  });

  test("the statements after a return or break, marked with & or not, are read as its block's, where Luau's parser ends the block", () => {
    // Sparkdown runs none of them, and the unreachable-code lint reports the first (#1286).
    for (const text of [
      "function f()\n  & return 1\n  & x = 2\nend\n",
      "function f()\n  while true do\n    & break\n    & x = 2\n  end\nend\n",
      "function f()\n  return 1\n  x = 2\nend\n",
    ]) {
      const { tree, luau } = preludeErrors(text);
      expect(luau.length).toBeGreaterThan(0);
      expect(tree).toEqual([]);
    }
    expect(preludeErrors("function f()\n  & x = 2\n  & return 1\nend\n")).toEqual({ tree: [], luau: [] });
  });

  test("an interpolation missing its closing brace is an error where Luau reports it", () => {
    const { tree, luau } = preludeErrors("local x = `a{x`\n");
    expect(luau).toEqual(["0:14 Malformed interpolated string; did you forget to add a '}'?"]);
    expect(tree).toEqual(luau);
  });

  test("an error at the end of an interpolation's expression stays in the interpolation", () => {
    const { tree, luau } = preludeErrors("local x = `a{x +}`\nlocal y = 1\n");
    expect(luau.map((e) => e.split(" ")[0])).toEqual(["0:16"]);
    expect(tree.map((e) => e.split(" ")[0])).toEqual(["0:16"]);
  });

  test("a flow whose only Luau is a branch's parameters keeps them, as the checker's unit does", () => {
    const text = "scene s(x)\n  branch b(y: Missing)\n  Hello.\n  end\nend\n";
    const tree = parseSource(text);
    const extracted = checkerTextUnits(tree, text);
    const units = readLuauUnits(tree, text);
    expect(extracted.flows).toHaveLength(1);
    expect(units.flows).toHaveLength(1);
    expect(units.flows[0]!.statements.map((s) => [s.statement.kind, s.nodes.map((n) => n.name)])).toEqual([["StatLocal", ["Branch"]]]);
    expect(printAst(units.flows[0]!.root, checkerView(text, extracted.anyName))).toBe(printAst(parseLuau(extracted.flows[0]!.text).root));
  });
});

describe("The other entry points", () => {
  test("a run file is read from its wrapper document as Luau reads the file, with its hot comments", () => {
    const file = ["--!strict", "local t = { 1, 2 }", "local function sum(xs: { number }): number", "  local total = 0", "  for _, x in ipairs(xs) do total += x end", "  return total", "end", "print(sum(t) .. \"!\")", ""].join("\n");
    const text = runWrapperText("W", file);
    const unit = readLuauRunFile(parseSource(text), text);
    expect(unit).toBeDefined();
    const parsed = parseLuau(file);
    expect(parsed.errors).toEqual([]);
    expect(unit!.errors).toEqual([]);
    expect(printAst(unit!.root)).toBe(printAst(parsed.root));
    expect(unit!.hotcomments.map((c) => [c.header, c.content])).toEqual([[true, "strict"]]);
    // The file's lines are the wrapper document's, two lines down.
    expect(unit!.root.body[0]!.location.begin.line).toBe(parsed.root.body[0]!.location.begin.line + 2);
  });

  test("a run file's statements each name the tree node they were read from", () => {
    const text = runWrapperText("W", "local a = 1\nlocal b = 2\na = b\n");
    const tree = parseSource(text);
    const unit = readLuauRunFile(tree, text)!;
    expect(unit.statements.map((s) => [s.statement.kind, s.nodes.map((n) => text.slice(n.from, n.to).trim())])).toEqual([
      ["StatLocal", ["local a = 1"]],
      ["StatLocal", ["local b = 2"]],
      ["StatAssign", ["a = b"]],
    ]);
    for (const source of unit.statements) expect(statementAt(unit, source.nodes[0]!)).toBe(source.statement);
  });

  test("type functions and the attributes the grammar reads are read as Luau reads them", () => {
    const file = [
      "type function id(t) return t end",
      "export type function id2(t) return t end",
      "@native function f() return 1 end",
      "@checked local function g(x: number) return x end",
      "local h = @native function() end",
      "@native @checked function k() end",
      "",
    ].join("\n");
    const text = runWrapperText("W", file);
    const unit = readLuauRunFile(parseSource(text), text)!;
    const parsed = parseLuau(file);
    expect(parsed.errors).toEqual([]);
    expect(unit.errors).toEqual([]);
    expect(printAst(unit.root)).toBe(printAst(parsed.root));
    // Names an object inherits are no attributes either.
    const bad = "local x = 1\ntype function t() return x end\n@nope function f() end\n@constructor function g() end\n@toString function h() end\n@__proto__ function i() end\n@hasOwnProperty function j() end\n";
    const badText = runWrapperText("W", bad);
    const expected = parseLuau(bad).errors.map((e) => e.message);
    expect(expected).toContain("Invalid attribute '@constructor'");
    expect(readLuauRunFile(parseSource(badText), badText)!.errors.map((e) => e.message)).toEqual(expected);
  });

  test("a narrative interpolation's expression is read with Luau's precedence, its names as globals", () => {
    const narrative = ": Total {a + b * -c ^ 2 .. f(x):m().y}\n";
    const cursor = parseSource(narrative).cursor();
    const printed: string[] = [];
    do {
      if (cursor.name === "LuauInterpolatedStringExpression") {
        const inner = [];
        for (let child = cursor.node.firstChild; child; child = child.nextSibling) inner.push(child);
        const { expr, errors } = readLuauExpression(inner.slice(1, -1), narrative);
        expect(errors).toEqual([]);
        printed.push(printAst(expr));
      }
    } while (cursor.next());
    expect(printed).toEqual([printAst(parseLuau("return a + b * -c ^ 2 .. f(x):m().y").root.body[0]!).replace(/^StatReturn\n/, "").replace(/^  /gm, "")]);
  });
});

test("the converter reads the tree, not the text through Luau's parser", () => {
  const source = readFileSync(join(__dirname, "..", "..", "compiler", "typecheck", "readLuauAst.ts"), "utf8");
  expect(source).not.toMatch(/from "\.\/DefinitionParser"/);
  expect(source).not.toMatch(/\bparseLuau\(/);
});
