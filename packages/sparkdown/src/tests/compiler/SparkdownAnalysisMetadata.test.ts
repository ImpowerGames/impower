import "../../inkjs/engine/Container";
import { expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { AstStatLocal, AstStatLocalFunction, AstTypeReference, visitAst, type AstLocal } from "../../compiler/typecheck/Ast";
import type { Position } from "../../compiler/typecheck/Location";
import type { Location } from "../../compiler/typecheck/Location";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";

function unit(source: string) {
  const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
  const result = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(result.errors).toEqual([]);
  return result;
}

test("qualified references retain the exact preceding lexical binding across nested shadow and capture", () => {
  // Parser.cpp's localMap lookup occurs while reading the qualified name.
  // The identically spelled nested binding is a different AstLocal.
  const input = unit('local Module = require("outer")\ntype Outside = Module.Alias\nlocal function inner()\n  type Captured = Module.Alias\n  local Module = require("inner")\n  type Inside = Module.Alias\nend\ntype After = Module.Alias\ntype Missing = Unknown.Alias\n');
  const outer = (input.root.body[0] as AstStatLocal).vars[0]!;
  const fn = input.root.body[2] as AstStatLocalFunction;
  const inner = (fn.func.body.body[1] as AstStatLocal).vars[0]!;
  const references: Array<AstTypeReference & { prefixLocal?: AstLocal | null }> = [];
  visitAst(input.root, { visit(node) { if (node instanceof AstTypeReference && node.prefix) references.push(node); return true; } });
  expect(references.map(r => r.prefix)).toEqual(["Module", "Module", "Module", "Module", "Unknown"]);
  expect(references[0]!.prefixLocal === outer).toBe(true);
  expect(references[1]!.prefixLocal === outer).toBe(true);
  expect(references[2]!.prefixLocal === inner).toBe(true);
  expect(references[3]!.prefixLocal === outer).toBe(true);
  expect(references[4]!.prefixLocal).toBeNull();
  expect(inner === outer).toBe(false);
  expect(inner.shadow === outer).toBe(true);
});

test("const function keywords retain their consumed position independently from attributes", () => {
  // Pinned AstStatLocalFunction stores Position::missing for non-const and
  // the consumed const keyword position even when the statement starts at @.
  const input = unit("local function ordinary(): number return 1 end\nconst function plain(): number return 2 end\n@native\nconst function attributed(): number return 3 end\n");
  const functions = input.root.body as Array<AstStatLocalFunction & { constKeywordBegin?: Position }>;
  expect(functions.every(f => f instanceof AstStatLocalFunction)).toBe(true);
  expect(functions[0]!.constKeywordBegin).toEqual({ line: 0xffffffff, column: 0xffffffff });
  expect(functions[1]!.constKeywordBegin).toEqual({ line: 1, column: 0 });
  expect(functions[2]!.constKeywordBegin).toEqual({ line: 3, column: 0 });
  expect(functions[2]!.location.begin).toEqual({ line: 2, column: 0 });
  expect(functions[2]!.func.attributes).toHaveLength(1);
});

test("lexical comments preserve UTF16 CRLF ranges, delimiters and trailing spaces", () => {
  const source = "-- line 😀  \r\n--[=[ block\r\ncontent 😀 ]=]\r\nlocal value = 42 -- suffix  \r\nreturn value\r\n";
  const comments = (unit(source) as unknown as { commentLocations: Array<{ kind: string; location: Location }> }).commentLocations;
  expect(comments?.map(c => c.kind)).toEqual(["Comment", "BlockComment", "Comment"]);
  expect(comments.map(c => ({ begin: c.location.begin, end: c.location.end }))).toEqual([
    { begin: { line: 0, column: 0 }, end: { line: 0, column: source.indexOf("\r") } },
    { begin: { line: 1, column: 0 }, end: { line: 2, column: source.split("\r\n")[2]!.length } },
    { begin: { line: 3, column: 17 }, end: { line: 3, column: source.split("\r\n")[3]!.length } },
  ]);
});

test("Luau trivia belongs to its Sparkdown unit while narrative comment-looking text stays narrative", () => {
  const source = "local before = 1 -- prelude comment\n-- narrative text\nscene main\n  local value = 42 -- flow comment 😀\n  -- narrative text\n  local after = value\nend\n";
  const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
  const input = sparkdownUnits(compiler.documents.parser.parse(source), source);
  const comments = (u: unknown) => (u as { commentLocations: Array<{ kind: string; location: Location }> }).commentLocations;
  expect(comments(input.prelude)?.map(c => c.kind)).toEqual(["Comment"]);
  expect(comments(input.flows[0])?.map(c => c.kind)).toEqual(["Comment"]);
  const flow = input.flows[0]!;
  expect(flow.lines[comments(flow)[0]!.location.begin.line]).toBe(3);
  expect(comments(flow)[0]!.location.begin.column).toBe(19);
});
