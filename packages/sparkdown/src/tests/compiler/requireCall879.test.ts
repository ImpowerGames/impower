import { describe, expect, test } from "vitest";
import {
  AstExprCall,
  AstExprGlobal,
  AstExprLocal,
  AstStatFunction,
  AstStatLocal,
  AstStatReturn,
  AstStatTypeAlias,
  visitAst,
  type AstNode,
} from "../../compiler/typecheck/Ast";
import { readLuauRunFile, readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { runWrapperText } from "../../compiler/utils/runWrapper";
import { parseSource } from "./grammarSnapshot";
import { tokenize } from "./vscodeGrammarSnapshot";

// Syntax only: recognizing the ordinary global does not implement a module
// loader, resolve game/script, or make an unbound require call executable.
function treeWithoutErrors(source: string) {
  const tree = parseSource(source);
  const errors: string[] = [];
  const cursor = tree.cursor();
  do {
    if (cursor.name.startsWith("ERROR")) {
      errors.push(`${cursor.name}: ${source.slice(cursor.from, cursor.to)}`);
    }
  } while (cursor.next());
  expect(errors).toEqual([]);
  return tree;
}

function callsNamed(root: AstNode, name: string) {
  const calls: AstExprCall[] = [];
  visitAst(root, {
    visit(node) {
      if (node instanceof AstExprCall &&
          ((node.func instanceof AstExprGlobal && node.func.name === name) ||
           (node.func instanceof AstExprLocal && node.func.local.name === name))) {
        calls.push(node);
      }
      return true;
    },
  });
  return calls;
}

async function highlightedCalls(source: string, name: string, count: number) {
  const tokens = (await tokenize(source)).flatMap((line) => line.tokens);
  const names = tokens.filter((token) => token.text === name);
  expect(names).toHaveLength(count);
  for (const token of names) {
    expect(token.scopes.some((scope) =>
      scope === "entity.name.function.luau" || scope === "support.function.luau",
    ), `${name}: ${token.scopes.join(", ")}`).toBe(true);
    expect(token.scopes.some((scope) => scope.startsWith("invalid."))).toBe(false);
  }
}

const functionCases = [
  { label: "numeric argument from the ticket", statement: "local m = require(1)", name: "require", count: 1 },
  { label: "variable argument from the ticket", statement: "local m = require(x)", name: "require", count: 1 },
  { label: "script.Parent argument from the ticket", statement: "local Test = require(script.Parent.Thing)", name: "require", count: 1 },
  { label: "script.Parent.A conformance argument", statement: "local m = require(script.Parent.A)", name: "require", count: 1 },
  { label: "game.A argument", statement: "local m = require(game.A)", name: "require", count: 1 },
  { label: "nested call", statement: "local m = require(require(game.A))", name: "require", count: 2 },
  { label: "multiline arguments", statement: "local m = require(\n    game.A\n  )", name: "require", count: 1 },
  { label: "call statement", statement: "require(1)", name: "require", count: 1 },
  { label: "ordinary find control", statement: "local Test = find(script.Parent.Thing)", name: "find", count: 1 },
] as const;

describe("ordinary require calls retain the enclosing function (#879)", () => {
  for (const fixture of functionCases) {
    const source = `Value {f()}.\nfunction f()\n  ${fixture.statement}\n  return 1\nend\n`;
    test(`${fixture.label}: Sparkmorph tree and AST`, () => {
      const units = readLuauUnits(treeWithoutErrors(source), source);
      expect(units.prelude.errors).toEqual([]);
      const fn = units.prelude.root.body.find((node) =>
        node instanceof AstStatFunction && node.name instanceof AstExprGlobal && node.name.name === "f",
      );
      expect(fn).toBeInstanceOf(AstStatFunction);
      if (!(fn instanceof AstStatFunction)) throw new Error("f was lost");
      expect(callsNamed(fn.func.body, fixture.name)).toHaveLength(fixture.count);
      expect(fn.func.body.body.at(-1)).toBeInstanceOf(AstStatReturn);
      expect(fn.func.body.location.end.line).toBe(source.split("\n").length - 2);
    });
    test(`${fixture.label}: real TextMate`, async () => {
      await highlightedCalls(source, fixture.name, fixture.count);
    });
  }
});

// Exact raw literals from #1384's pinned cycles_dont_make_everything_any:
// luau-lang/luau@7d5f73364fdbbaa984fa545071630eba73cfea98,
// tests/TypeInfer.modules.test.cpp:802. Retain indentation and strict mode.
// These test each written module's syntax; graph checking belongs to #1384.
const cycleModules = [
  ["game/A", `
        --!strict
        local module = {}

        function module.foo()
            return 2
        end

        function module.bar()
            local m = require(game.B)
            return m.foo() + 1
        end

        return module
    `],
  ["game/B", `
        --!strict
        local module = {}

        function module.foo()
            return 2
        end

        function module.bar()
            local m = require(game.A)
            return m.foo() + 1
        end

        return module
    `],
] as const;

const sharedModules = [
  ["shared game.A entry", "local A=require(game.A)\nreturn A"],
  ["shared multiple-module entry", "local A=require(game.A)\nlocal B=require(game.B)\nreturn A"],
] as const;

describe("written module source contracts parse without executing a loader", () => {
  for (const [label, file] of [...cycleModules, ...sharedModules]) {
    const source = runWrapperText("W", file);
    const count = label === "shared multiple-module entry" ? 2 : 1;
    test(`${label}: Sparkmorph tree and AST`, () => {
      const unit = readLuauRunFile(treeWithoutErrors(source), source);
      expect(unit).toBeDefined();
      expect(unit!.errors).toEqual([]);
      expect(callsNamed(unit!.root, "require")).toHaveLength(count);
      expect(unit!.root.body.at(-1)).toBeInstanceOf(AstStatReturn);
      if (label.startsWith("game/")) {
        expect(unit!.hotcomments.map((comment) => [comment.header, comment.content])).toEqual([[true, "strict"]]);
        expect(unit!.root.body.map((node) => node.kind)).toEqual([
          "StatLocal", "StatFunction", "StatFunction", "StatReturn",
        ]);
      }
    });
    test(`${label}: real TextMate`, async () => {
      await highlightedCalls(source, "require", count);
    });
  }
});

describe("require keeps identifier and story boundary behavior", () => {
  test("script.Parent control is still an assignment value", () => {
    const source = "function f()\n  local s = script.Parent\n  return 1\nend\n";
    const unit = readLuauUnits(treeWithoutErrors(source), source).prelude;
    expect(unit.errors).toEqual([]);
    const fn = unit.root.body[0] as AstStatFunction;
    expect(fn.func.body.body[0]).toBeInstanceOf(AstStatLocal);
    expect((fn.func.body.body[0] as AstStatLocal).values).toHaveLength(1);
    expect(fn.func.body.body[1]).toBeInstanceOf(AstStatReturn);
  });

  test("export type remains exported and require can be an ordinary value", () => {
    const source = runWrapperText("W", "export type T = number\nlocal loader = require\nreturn loader\n");
    const unit = readLuauRunFile(treeWithoutErrors(source), source)!;
    expect(unit.errors).toEqual([]);
    expect(unit.root.body[0]).toBeInstanceOf(AstStatTypeAlias);
    expect((unit.root.body[0] as AstStatTypeAlias).exported).toBe(true);
    const value = (unit.root.body[1] as AstStatLocal).values[0];
    expect(value).toBeInstanceOf(AstExprGlobal);
    expect((value as AstExprGlobal).name).toBe("require");
  });

  test("a local require call binds to its local declaration", () => {
    const source = runWrapperText("W", "local require = function(x) return x end\nlocal m = require(1)\nreturn m\n");
    const unit = readLuauRunFile(treeWithoutErrors(source), source)!;
    expect(unit.errors).toEqual([]);
    const call = callsNamed(unit.root, "require")[0]!;
    expect(call.func).toBeInstanceOf(AstExprLocal);
    expect((call.func as AstExprLocal).local).toBe((unit.root.body[0] as AstStatLocal).vars[0]);
  });

  for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]] as const) {
    const source = ["scene s", "  & local m = require(1)", "  Hello after the call.", "  & local n = 2", "end", ""].join(eol);
    test(`${label}: marked call ends at its physical line in Sparkmorph`, () => {
      const units = readLuauUnits(treeWithoutErrors(source), source);
      expect(units.prelude.errors).toEqual([]);
      expect(units.flows).toHaveLength(1);
      const flow = units.flows[0]!;
      expect(flow.errors).toEqual([]);
      expect(callsNamed(flow.root, "require")).toHaveLength(1);
      expect(flow.statements).toHaveLength(2);
      expect(flow.statements.map((entry) => entry.statement.location.begin.line)).toEqual([1, 3]);
      expect(flow.statements.flatMap((entry) => entry.nodes).map((node) => source.slice(node.from, node.to)).join(" ")).not.toContain("Hello after");
    });
    test(`${label}: real TextMate closes call parameters before prose`, async () => {
      await highlightedCalls(source, "require", 1);
      const prose = (await tokenize(source))[2]!;
      expect(prose.tokens.some((token) => token.scopes.includes("meta.parameter.luau"))).toBe(false);
    });
  }

  const interpolation = "Value {require(1)}.\nAfter the interpolation.\n";
  test("narrative interpolation retains the require call in Sparkmorph", () => {
    const tree = treeWithoutErrors(interpolation);
    const cursor = tree.cursor();
    const calls: string[] = [];
    do {
      if (cursor.name === "LuauFunctionCall") calls.push(interpolation.slice(cursor.from, cursor.to));
    } while (cursor.next());
    expect(calls).toEqual(["require(1)"]);
  });
  test("narrative interpolation highlights its call in real TextMate", async () => {
    await highlightedCalls(interpolation, "require", 1);
  });
});
