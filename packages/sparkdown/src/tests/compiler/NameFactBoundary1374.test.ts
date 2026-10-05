import "../../inkjs/engine/Container";
import { expect, test } from "vitest";
import { collectLuauLints } from "../../compiler/lint/collectLuauLints";
import { parseSource } from "./grammarSnapshot";

function facts(source: string) {
  const tree = parseSource(source);
  return collectLuauLints(tree, (from, to) => source.slice(from, to));
}

test.each([
  "function f(p: number) local n = p; return n end",
  "& function f(p: number) local n = p; return n end",
  "& local f = function(p: number) local n = p; return n end",
])("name facts retain function parameter/local identity in %s", line => {
  const source = `${line}\n& f(1)\nFollowing.\n`;
  const result = facts(source);
  expect(result.lints).toEqual([]);
  for (const name of ["p", "n"]) {
    const declaration = result.names.declarations.find(item => item.name === name)!;
    const reference = result.names.references.find(item => item.name === name)!;
    expect(declaration).toBeDefined();
    expect(reference).toBeDefined();
    expect(reference.local === declaration.local).toBe(true);
    expect(reference.enclosingFunction === declaration.enclosingFunction).toBe(true);
    expect(source.slice(reference.from, reference.to)).toBe(name);
  }
  const call = result.names.references.find(item => item.name === "f" && item.access === "read")!;
  expect(call.from).toBe(source.indexOf("f(1)"));
  expect(call.enclosingFunction).toBeUndefined();
});

test("an intersection annotation keeps its value binding in the original function", () => {
  const source = "function f(p: { x: number }\n  & { y: string })\n  local n = p.x\n  return n\nend\n& f({ x = 1, y = 'ok' })\n";
  const result = facts(source);
  const parameter = result.names.declarations.find(item => item.name === "p")!;
  const read = result.names.references.find(item => item.name === "p")!;
  expect(parameter).toBeDefined();
  expect(read).toBeDefined();
  expect(read.local === parameter.local).toBe(true);
  expect(read.enclosingFunction === parameter.enclosingFunction).toBe(true);
  expect(result.lints).toEqual([]);
});

test("incomplete marked function recovery does not give the next statement its name scope", () => {
  for (const newline of ["\n", "\r\n"]) {
    const source = ["& local f = function(p:", "& after()", "Following.", ""].join(newline);
    const result = facts(source);
    const next = result.names.references.filter(item => item.name === "after");
    expect(next).toHaveLength(1);
    expect(next[0]!.from).toBe(source.indexOf("after"));
    expect(next[0]!.enclosingFunction).toBeUndefined();
    const declaration = result.names.declarations.find(item => item.name === "f")!;
    expect(declaration.function!.body.hasEnd).toBe(false);
    expect(declaration.function!.body.location.end.line).toBe(0);
    expect(result.names.references.some(item => item.name.includes("%error-id%"))).toBe(false);
  }
});

test("cached bounded function facts and an edited tree retain separate local identities", () => {
  const source = "& local f = function(p: number) return p end\n& f(1)\n";
  const tree = parseSource(source);
  const first = collectLuauLints(tree, (from, to) => source.slice(from, to));
  const warm = collectLuauLints(tree, (from, to) => source.slice(from, to));
  expect(warm.names === first.names).toBe(true);
  const changed = facts(source.replace("p: number", "q: number").replace("return p", "return q"));
  expect(changed.names.declarations.some(item => item.name === "p")).toBe(false);
  const parameter = changed.names.declarations.find(item => item.name === "q")!;
  const read = changed.names.references.find(item => item.name === "q")!;
  expect(read.local === parameter.local).toBe(true);
  expect(parameter.local === first.names.declarations.find(item => item.name === "p")!.local).toBe(false);
});
