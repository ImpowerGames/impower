import { describe, expect, test } from "vitest";
import { NodeType, Tree, TreeBuffer } from "@lezer/common";
import * as lint from "../../compiler/lint/collectLuauLints";
import { AstExprFunction, AstExprLocal, AstStatFor, AstStatForIn, AstStatLocal, visitAst } from "../../compiler/typecheck/Ast";
import { readDocumentUnits } from "../../compiler/typecheck/LuauDocumentChecker";
import { getParser } from "./grammarSnapshot";
import { testCompiler } from "../engineUnderTest";

function script(text: string) {
  const tree = getParser().parse(text);
  return { tree, text, result: lint.collectLuauLints(tree, (from, to) => text.slice(from, to)) };
}

// Access through the existing entry point so the base fails a behavioral
// assertion for its absent facts, rather than failing to import a new module.
function names(value: ReturnType<typeof script>) {
  expect(value.result).toHaveProperty("names");
  expect(value.result).toHaveProperty("roots");
  return (value.result as any).names;
}

/** The same public Lezer tree with its packed forests expanded to trees. */
function unpack(part: Tree | TreeBuffer): Tree {
  if (part instanceof Tree) return new Tree(part.type, part.children.map(unpack), part.positions, part.length);
  const { buffer, set } = part;
  const node = (at: number): Tree => {
    const children: Tree[] = [];
    const positions: number[] = [];
    for (let i = at + 4; i < buffer[at + 3]!; i = buffer[i + 3]!) {
      children.push(node(i));
      positions.push(buffer[i + 1]! - buffer[at + 1]!);
    }
    return new Tree(set.types[buffer[at]!]!, children, positions, buffer[at + 2]! - buffer[at + 1]!);
  };
  const children: Tree[] = [];
  const positions: number[] = [];
  for (let i = 0; i < buffer.length; i = buffer[i + 3]!) {
    children.push(node(i));
    positions.push(buffer[i + 1]!);
  }
  return new Tree(NodeType.none, children, positions, part.length);
}

describe("shared AST name facts", () => {
  test("malformed declarations do not publish parser recovery names or warn about them", () => {
    const value = script("function f()\n local a,\n type T = number\n local b,\n export type U = T\n local c,\n const d = 1\n local e,\n local g = 2\n return a\nend\n");
    expect(value.result.lints.map(lint => lint.message)).not.toContain("Variable '%error-id%' is never used; prefix with '_' to silence");
    expect(value.result.lints.some(lint => lint.message.includes("Variable 'g'"))).toBe(true);
    expect(names(value).declarations.some((declaration: any) => declaration.name === "%error-id%")).toBe(false); // not a node name
    expect(names(value).references.some((reference: any) => reference.name === "%error-id%")).toBe(false); // not a node name
    expect(value.result.roots[0]!.root).toBe(readDocumentUnits(value.tree, value.text).prelude.root);
  });
  test("keeps the checker's local binding identity through shadows, closures and repeat conditions", () => {
    const value = script("function f()\n local x = 1\n do local x = 2; print(x) end\n local g = function() return x end\n repeat local done = true until done\n return g()\nend\n");
    const facts = names(value);
    const declarations: any[] = [];
    const uses: AstExprLocal[] = [];
    visitAst(readDocumentUnits(value.tree, value.text).prelude.root, {
      visit(node) {
        if (node instanceof AstStatLocal) declarations.push(...node.vars);
        if (node instanceof AstExprLocal) uses.push(node);
        return true;
      },
    });
    for (const local of declarations) expect(facts.declarations.some((d: any) => d.local === local)).toBe(true);
    for (const use of uses) expect(facts.references.some((r: any) => r.node === use && r.local === use.local)).toBe(true);
    const xs = facts.references.filter((r: any) => r.name === "x"); // not a node name
    expect(new Set(xs.map((r: any) => r.local)).size).toBe(2);
    expect(xs.every((r: any) => r.enclosingFunction)).toBe(true);
    const done = facts.references.find((r: any) => r.name === "done"); // not a node name
    expect(done.local).toBe(facts.declarations.find((d: any) => d.name === "done").local); // not a node name
  });

  test("distinguishes reads, plain and compound writes, functions, stores and constants", () => {
    const facts = names(script("store saved = 1\nconst fixed = 2\nfunction f()\n local x = saved\n x = 3; x += fixed\n global = x\nend\n"));
    expect(facts.globals.filter((g: any) => ["saved", "fixed", "f"].includes(g.name)).map((g: any) => [g.name, g.kind])).toEqual([["saved", "store"], ["fixed", "const"], ["f", "function"]]); // not a node name
    expect(facts.references.filter((r: any) => r.name === "x").map((r: any) => r.access)).toEqual(["write", "readwrite", "read"]); // not a node name
    expect(facts.references.find((r: any) => r.name === "global").access).toBe("write"); // not a node name
    expect(facts.references.find((r: any) => r.name === "fixed").local).toBeUndefined(); // not a node name
  });

  test("function-valued stores retain explicit declaration kind and function metadata", () => {
    const source = "store callback = function() nestedWrite = 1; function nested() return nestedWrite end; return 1 end\nconst fixed = function() return 2 end\nstore function declared() return callback() end\nfunction authored() ordinary = 3; return callback() end\n& following = 4\n";
    const facts = names(script(source));
    const stored = facts.globals.find((g: any) => g.name === "callback"); // not a node name
    const constant = facts.globals.find((g: any) => g.name === "fixed"); // not a node name
    const authored = facts.globals.find((g: any) => g.name === "authored"); // not a node name
    expect(stored.kind).toBe("store");
    expect(stored.function instanceof AstExprFunction).toBe(true);
    expect(constant.kind).toBe("const");
    expect(constant.function instanceof AstExprFunction).toBe(true);
    expect(authored.kind).toBe("function");
    expect(authored.function instanceof AstExprFunction).toBe(true);
    const declared = facts.globals.find((g: any) => g.name === "declared"); // not a node name
    expect(declared.kind).toBe("store");
    expect(declared.function instanceof AstExprFunction).toBe(true);
    for (const name of ["nestedWrite", "ordinary", "following"]) {
      expect(facts.globals.find((g: any) => g.name === name).kind).toBe("assignment");
    }
    const nested = facts.globals.find((g: any) => g.name === "nested"); // not a node name
    expect(nested.kind).toBe("function");
    expect(nested.enclosingFunction).toBe(stored.function);
    expect(source.slice(stored.from, stored.to)).toBe("callback");
    expect(source.slice(declared.from, declared.to)).toBe("declared");
  });

  test("embedded tables index their values without publishing field keys as reads", () => {
    const value = script("store a = true\ndefine hero as character with\n v = { x = a and a, nested = { y = a }, [key] = a }\nend\nHi.\n");
    const reads = names(value).references.filter((r: any) => r.access === "read").map((r: any) => r.name);
    expect(reads).toEqual(["a", "a", "a", "key", "a"]);
    expect(value.result.lints.filter(lint => lint.code === "DuplicateCondition")).toHaveLength(1);
  });

  test.each([
    ["another function", "function caller() return target() end\n"],
    ["logic line", "& target()\n"],
    ["interpolation", "Hi {target()}.\n"],
    ["bare interpolation", "Hi {target}.\n"],
    ["call shorthand", "Hi {{target()}}.\n"],
    ["Sparkle handler", "layout main with\n button @click=target()\nend\n"],
    ["Sparkle closure", "layout main with\n button @click={ target() }\nend\n"],
  ])("indexes uses from %s across scripts", (_label, source) => {
    const definition = names(script("function target() end\n"));
    const use = names(script(source));
    expect((lint as any).indexProgramNames).toBeTypeOf("function");
    const index = (lint as any).indexProgramNames([{ uri: "definition", names: definition }, { uri: "use", names: use }]);
    expect(index.globals.get("target").reads.some((r: any) => r.uri === "use")).toBe(true);
    expect(index.globals.get("target").definitions[0].uri).toBe("definition");
  });

  test("reuses unchanged tree facts and removes changed or removed script uses on recombination", () => {
    const definition = script("function target() end\n");
    const original = script("Hi {target()}.\n");
    const facts = names(definition);
    expect((lint.collectLuauLints(definition.tree, (from, to) => definition.text.slice(from, to)) as any).names).toBe(facts);
    const edited = names(script("Hi.\n"));
    const index = (lint as any).indexProgramNames;
    expect(index([{ uri: "d", names: facts }, { uri: "u", names: names(original) }]).globals.get("target").reads).toHaveLength(1);
    expect(index([{ uri: "d", names: facts }, { uri: "u", names: edited }]).globals.get("target").reads).toHaveLength(0);
    expect(index([{ uri: "d", names: facts }]).globals.get("target").reads).toHaveLength(0);
    expect(edited).not.toBe(names(original));
  });

  test("records qualified methods and separate branch scopes without writing their receivers", () => {
    const facts = names(script("function setup()\n local T = {}\n function T.x() end\n function T:x() end\n if flag then function conditional() end else function conditional() end end\nend\n"));
    const methods = facts.functions.filter((f: any) => f.name === "T.x"); // not a node name
    expect(methods).toHaveLength(2);
    expect(methods.map((f: any) => f.method)).toEqual([false, true]);
    expect(methods[0].receiver.local).toBe(methods[1].receiver.local);
    expect(methods[0].scope).toBe(methods[1].scope);
    expect(facts.references.filter((r: any) => r.name === "T").every((r: any) => r.access === "read")).toBe(true); // not a node name
    expect(facts.globals.some((g: any) => g.name === "T")).toBe(false); // not a node name
    const arms = facts.functions.filter((f: any) => f.name === "conditional"); // not a node name
    expect(arms).toHaveLength(2);
    expect(arms[0].scope).not.toBe(arms[1].scope);
  });

  test("handler uses stay outside authored functions while nested function values retain their enclosure", () => {
    const facts = names(script("layout main with\n button @click={ print(outside); local callback = function() print(inside) end }\nend\n"));
    expect(facts.references.find((r: any) => r.name === "outside").enclosingFunction).toBeUndefined(); // not a node name
    expect(facts.references.find((r: any) => r.name === "inside").enclosingFunction).toBeDefined(); // not a node name
  });

  test("packed, expanded and moved reused fragments preserve candidates, findings and offsets", () => {
    const original = script("function f() local unused = 1; print(_) end\nHi {target()} {if condition then 1 elseif condition then 2 else 3}.\n");
    const expanded = lint.collectLuauLints(unpack(original.tree), (from, to) => original.text.slice(from, to));
    expect(expanded.lints).toEqual(original.result.lints);
    expect(expanded.names.references.map(({ name, from, to, access }: any) => ({ name, from, to, access }))).toEqual(names(original).references.map(({ name, from, to, access }: any) => ({ name, from, to, access })));
    const prefix = "\n\n";
    const moved = new Tree(original.tree.type, original.tree.children, original.tree.positions.map(p => p + prefix.length), original.tree.length + prefix.length);
    const text = prefix + original.text;
    const shifted = lint.collectLuauLints(moved, (from, to) => text.slice(from, to));
    expect(shifted.lints).toEqual(original.result.lints.map(l => ({ ...l, from: l.from + prefix.length, to: l.to + prefix.length })));
    expect(shifted.names.references.find((r: any) => r.name === "target")!.from).toBe(names(original).references.find((r: any) => r.name === "target").from + prefix.length); // not a node name
  });

  test("compiler recombination uses current included scripts and cached untouched trees", () => {
    const compiler = testCompiler();
    const files = [
      { uri: "inmemory:///main.sd", text: "include use.sd\nfunction target() end\nReady.\n", name: "main" },
      { uri: "inmemory:///use.sd", text: "Hi {target()}.\n", name: "use" },
    ].map(f => ({ ...f, type: "script" as const, ext: "sd", version: 1, languageId: "sparkdown" }));
    compiler.configure({ files });
    const program = compiler.compile({ textDocument: { uri: files[0]!.uri } }).program;
    const initial = compiler.validateLints(program);
    expect(initial).toBeDefined();
    expect(initial.globals.get("target")!.reads.some(r => r.uri === files[1]!.uri)).toBe(true);
    const untouched = initial.scripts.get(files[0]!.uri);
    const reduced = { ...program, scripts: { [files[0]!.uri]: program.scripts[files[0]!.uri]! } };
    const removed = compiler.validateLints(reduced);
    expect(removed.scripts.get(files[0]!.uri)).toBe(untouched);
    expect(removed.globals.get("target")!.reads).toHaveLength(0);
  });

  test("parameter and loop declarations identify the bodies that hold their scope", () => {
    const value = script("function f(parameter)\n for i = 1, 3 do print(i) end\n for key, item in pairs(parameter) do print(key, item) end\nend\n");
    const facts = names(value);
    const expected = new Map();
    visitAst(readDocumentUnits(value.tree, value.text).prelude.root, {
      visit(node) {
        if (node instanceof AstExprFunction) for (const local of node.args) expected.set(local, node.body);
        if (node instanceof AstStatFor) expected.set(node.variable, node.body);
        if (node instanceof AstStatForIn) for (const local of node.vars) expected.set(local, node.body);
        return true;
      },
    });
    expect(expected.size).toBe(4);
    for (const [local, body] of expected) expect(facts.declarations.find((d: any) => d.local === local).scope).toBe(body);
  });
});
