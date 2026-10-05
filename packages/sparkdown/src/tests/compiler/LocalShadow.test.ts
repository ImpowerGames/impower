import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { diagnoseDetailed, diagnoseFilesDetailed } from "../luau-conformance/diagnosticTestHarness";
import type { File } from "../../compiler/types/File";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { collectLuauLints, indexProgramNames } from "../../compiler/lint/collectLuauLints";
import { readDocumentUnits } from "../../compiler/typecheck/LuauDocumentChecker";
import { getParser } from "./grammarSnapshot";

const shadows = (source: string) => diagnoseDetailed(source).filter(d => d.code === "LocalShadow");
const messages = (source: string) => shadows(source).map(d => d.message);

function definiteFacts(source: string) {
  const tree = getParser().parse(source);
  expect(readDocumentUnits(tree, source).prelude.errors).toEqual([]);
  return collectLuauLints(tree, (from, to) => source.slice(from, to)).names;
}

describe("LocalShadow follows authored bindings and actual reads", () => {
  test("warns on a used inner block local with the exact declaration range", () => {
    const source = "function f()\n local x = 1\n do\n  local x = 2\n  print(x)\n end\n return x\nend\n";
    expect(shadows(source)).toEqual([{
      file: "main.sd",
      code: "LocalShadow",
      message: "Variable 'x' shadows previous declaration at line 2",
      severity: 2,
      range: { start: { line: 3, character: 8 }, end: { line: 3, character: 9 } },
    }]);
  });

  test.each([
    ["unread local", "local x = 1; local x = 2; return 0"],
    ["plain writes only", "local x = 1; local x = 2; x = 3; return 0"],
    ["different function depth", "local x = 1; local g = function() local x = 2; return x end; return x, g()"],
    ["sibling scopes", "do local x = 1; print(x) end; do local x = 2; print(x) end"],
    ["builtin global", "local math = math; return math.max(1, 2)"],
    ["an unused global name", "local fresh = 1; return fresh"],
    ["malformed declaration", "local , = 1; return 0"],
  ])("stays silent for %s", (_label, body) => {
    expect(messages(`function f()\n ${body}\nend\n`)).toEqual([]);
  });

  test("a compound write also reads the shadowing local", () => {
    expect(messages("function f()\n local x = 1\n local x = 2\n x += 1\nend\n")).toEqual([
      "Variable 'x' shadows previous declaration at line 2",
    ]);
  });

  test("a complete anonymous function inside a complete function keeps its parameter shadow", () => {
    expect(messages("function outer()\n local callback = function(x)\n  local x = 2\n  return x\n end\n return callback(1)\nend\n")).toEqual([
      "Variable 'x' shadows previous declaration at line 2",
    ]);
  });

  test("an incomplete ancestor does not certify a nested function's bindings", () => {
    const source = "function outer()\n do\n  local callback = function(x)\n   local x = 2\n   return x\n  end\n end\n";
    const tree = getParser().parse(source);
    const units = readDocumentUnits(tree, source);
    expect(units.prelude.errors.length).toBeGreaterThan(0);
    const facts = collectLuauLints(tree, (from, to) => source.slice(from, to)).names;
    const local = facts.declarations.find(d => d.name === "x" && d.kind === "local")!;
    expect(local).toBeDefined();
    expect(local.local.shadow?.name).toBe("x");
    expect(facts.references.some(r => r.local === local.local && r.access === "read")).toBe(true);
    expect(messages(source)).toEqual([]);
  });

  test.each([
    ["style", "print(style)"],
    ["layout", "print(layout)"],
    ["match", "print(match)"],
  ])("an uncertain %s occurrence does not establish a used shadowing local", (name, use) => {
    // The finite AST probe verified this print-argument form has no parse
    // recovery. Assert real binding identities and missing read before silence.
    const value = name === "match" ? "true" : "{}";
    const source = `function f() local ${name} = ${value}; local ${name} = ${value}; ${use} end\n`;
    const facts = definiteFacts(source);
    const declared = facts.declarations.filter(d => d.name === name);
    expect(declared).toHaveLength(2);
    expect(declared[1]!.local.shadow).toBe(declared[0]!.local);
    expect(declared.every(d => d.scope?.hasEnd === true)).toBe(true);
    expect(facts.references.some(r => r.name === name)).toBe(false);
    expect(facts.uncertainNames.filter(u => u.name === name)).toEqual([{
      name, from: source.lastIndexOf(name), to: source.lastIndexOf(name) + name.length,
      reason: "grammar-keyword",
    }]);
    expect(messages(source)).toEqual([]);
  });

  test("const checking bindings do not become local shadow declarations", () => {
    expect(messages("function f()\n local x = 1\n const x = 2\n return x\nend\n")).toEqual([]);
  });

  test("a local hiding const checking bindings identifies the earlier runtime local", () => {
    expect(messages("function f()\n local x = 1\n const x = 2\n local x = 3\n return x\nend\n")).toEqual([
      "Variable 'x' shadows previous declaration at line 2",
    ]);
  });

  test.each(["scene", "branch"])("%s parameter shadows use authored locations", kind => {
    expect(messages(`${kind} intro(x)\n & local x = 2\n & print(x)\nend\n`)).toEqual([
      "Variable 'x' shadows previous declaration at line 1",
    ]);
  });

  test.each([
    ["numeric loop", "for x = 1, 2 do print(x) end"],
    ["generic loop", "for x in pairs({}) do print(x) end"],
    ["a local hiding a parameter", "local x = 2; return x"],
  ])("warns for %s", (_label, body) => {
    expect(messages(`function f(x)\n ${body}\nend\n`)).toEqual([
      "Variable 'x' shadows previous declaration at line 1",
    ]);
  });

  // Named #899 adaptation: used underscore-prefixed locals are exempt even
  // though pinned Luau exempts those names only from unused-local warnings.
  test.each(["_", "_value"])("exempts used %s from local and global shadows", name => {
    expect(messages(`function f(${name})\n local ${name} = 2\n return ${name}\nend\n`)).toEqual([]);
    expect(messages(`& ${name} = 1\nfunction f()\n local ${name} = 2\n return ${name}\nend\n`)).toEqual([]);
  });

  test("an assignment is an authored global reference and keeps the same-script wording", () => {
    expect(messages("& state = 1\nfunction f()\n local state = 2\n return state\nend\n")).toEqual([
      "Variable 'state' shadows a global variable used at line 1",
    ]);
  });
});

describe("LocalShadow uses the current whole program", () => {
  const subject = "function f()\n local state = 2\n return state\nend\n";

  // Named #899 adaptation: cross-script messages disambiguate the other
  // document's one-based line number with its existing project script path.
  test.each([
    ["logic read", "& print(state)\n"],
    ["logic write", "& state = 1\n"],
    ["narrative interpolation", "State: {state}.\n"],
    ["Sparkle handler", "layout main with\n button @click=state\nend\n"],
    ["Sparkle handler body", "layout main with\n button @click={ print(state) }\nend\n"],
  ])("sees another script's %s", (_label, use) => {
    const line = use.startsWith("layout") ? 2 : 1;
    expect(diagnoseFilesDetailed({
      "main.sd": "include subject.sd\ninclude use.sd\nReady.\n",
      "subject.sd": subject,
      "use.sd": use,
    }).filter(d => d.code === "LocalShadow")).toEqual([{
      file: "subject.sd",
      code: "LocalShadow",
      message: `Variable 'state' shadows a global variable used at line ${line} in 'use.sd'`,
      severity: 2,
      range: { start: { line: 1, character: 7 }, end: { line: 1, character: 12 } },
    }]);
  });

  test("selects external references by URI then offset rather than include order", () => {
    expect(diagnoseFilesDetailed({
      "main.sd": "include subject.sd\ninclude z.sd\ninclude a.sd\nReady.\n",
      "subject.sd": subject,
      "z.sd": "& state = 1\n",
      "a.sd": "One.\n& print(state)\n& state = 3\n",
    }).filter(d => d.code === "LocalShadow").map(d => d.message)).toEqual([
      "Variable 'state' shadows a global variable used at line 2 in 'a.sd'",
    ]);
  });

  // These prove shared-index uncertainty exclusion. The keyword grammar does
  // not provide a definite used local in these forms, so they do not claim an
  // active global-shadow candidate; the ordinary-state cases cover that path.
  test.each(["style", "layout", "match"])("the shared index excludes an uncertain %s argument from globals", name => {
    const external = `function inspect() local ${name} = ${name === "match" ? "true" : "{}"}; print(${name}) end\n`;
    const externalFacts = definiteFacts(external);
    expect(externalFacts.declarations.filter(d => d.name === name)).toHaveLength(1);
    expect(externalFacts.declarations.find(d => d.name === name)!.scope?.hasEnd).toBe(true);
    expect(externalFacts.references.some(r => r.name === name)).toBe(false);
    const index = indexProgramNames([{ uri: "inmemory:///use.sd", names: externalFacts }]);
    expect(index.globals.has(name)).toBe(false);
    expect(index.uncertainNames.get(name)).toEqual([{
      name, from: external.lastIndexOf(name), to: external.lastIndexOf(name) + name.length,
      reason: "grammar-keyword", uri: "inmemory:///use.sd",
    }]);
    expect(messages(external)).toEqual([]);
  });

  test("a constant declaration without an authored reference does not invent global use", () => {
    expect(diagnoseFilesDetailed({
      "main.sd": "include subject.sd\ninclude use.sd\nReady.\n",
      "subject.sd": subject,
      "use.sd": "const state = 1\n",
    }).filter(d => d.code === "LocalShadow")).toEqual([]);
  });

  test("prefers the current script's first reference over an external one", () => {
    expect(diagnoseFilesDetailed({
      "main.sd": "include subject.sd\ninclude a.sd\nReady.\n",
      "subject.sd": `& state = 1\n${subject}& print(state)\n`,
      "a.sd": "& print(state)\n",
    }).filter(d => d.code === "LocalShadow").map(d => d.message)).toEqual([
      "Variable 'state' shadows a global variable used at line 1",
    ]);
  });

  test("an unchanged script gains and loses warnings as another script changes or leaves the program", () => {
    const compiler = testCompiler();
    const main = "include subject.sd\ninclude use.sd\nReady.\n";
    const file = (path: string, text: string): File => ({
      uri: `inmemory:///${path}`, type: "script", name: path.replace(/\.sd$/, ""),
      ext: "sd", text, version: 1, languageId: "sparkdown",
    });
    compiler.configure({ files: [file("main.sd", main), file("subject.sd", subject), file("use.sd", "Nothing.\n")] });
    const compile = () => compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
    const found = (program: SparkProgram) => (program.diagnostics?.["inmemory:///subject.sd"] ?? [])
      .filter(d => d.code === "LocalShadow")
      .map(d => typeof d.message === "string" ? d.message : d.message.value);
    expect(found(compile())).toEqual([]);
    const unchangedTree = compiler.documents.tree("inmemory:///subject.sd");
    const update = (path: string, text: string, version: number) => compiler.updateDocument({
      textDocument: { uri: `inmemory:///${path}`, version }, contentChanges: [{ text }],
    });
    update("use.sd", "& state = 1\n", 2);
    expect(found(compile())).toEqual(["Variable 'state' shadows a global variable used at line 1 in 'use.sd'"]);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(unchangedTree);
    update("use.sd", "Nothing.\n", 3);
    expect(found(compile())).toEqual([]);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(unchangedTree);
    update("use.sd", "& state = 1\n", 4);
    expect(found(compile())).toHaveLength(1);
    update("main.sd", "include subject.sd\nReady.\n", 2);
    expect(found(compile())).toEqual([]);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(unchangedTree);
  });

  test("direct revalidation replaces global shadows when the current script set changes", () => {
    const compiler = testCompiler();
    const files = [
      { uri: "inmemory:///main.sd", text: `include use.sd\n${subject}`, name: "main" },
      { uri: "inmemory:///use.sd", text: "& state = 1\n", name: "use" },
    ].map(file => ({ ...file, type: "script" as const, ext: "sd", version: 1, languageId: "sparkdown" }));
    compiler.configure({ files });
    const program = compiler.compile({ textDocument: { uri: files[0]!.uri } }).program;
    const found = (value: SparkProgram) => (value.diagnostics?.[files[0]!.uri] ?? []).filter(d => d.code === "LocalShadow");
    expect(found(program)).toHaveLength(1);
    const names = compiler.validateLints(program);
    expect(found(program)).toHaveLength(1);
    const reduced = { ...program, scripts: { [files[0]!.uri]: program.scripts[files[0]!.uri]! } };
    const removed = compiler.validateLints(reduced);
    expect(removed.scripts.get(files[0]!.uri)).toBe(names.scripts.get(files[0]!.uri));
    expect(found(reduced)).toEqual([]);
  });
});

describe("LocalShadow retains lexical bindings in narrative and backtick expressions", () => {
  test("the corpus plural selectors and backtick interpolation keep their function parameter", () => {
    const source = 'function count_geese(n: number)\n  return `There {plural(n)|one="is"|other="are"} {n} {plural(n)|one="goose"|other="geese"}.`\nend\n';
    expect(messages(source)).toEqual([]);
  });

  const cases = [
    ["scene narrative", "scene inspect899(value)\n Value: {value}.\n & print(value)\nend\n", 5],
    ["function backtick", "function inspect899(value)\n print(value)\n return `Value: {value}.`\nend\n", 5],
  ] as const;

  test.each(cases)("%s does not invent external global use", (_label, source) => {
    expect(messages(source)).toEqual([]);
  });

  test.each(cases)("%s still sees a genuine external narrative global", (_label, source, line) => {
    expect(messages(`${source}Outside: {value}.\n`)).toEqual([
      `Variable 'value' shadows a global variable used at line ${line}`,
    ]);
  });

  test.each(cases)("%s still sees a genuine external global write", (_label, source, line) => {
    expect(messages(`${source}& value = 7\n`)).toEqual([
      `Variable 'value' shadows a global variable used at line ${line}`,
    ]);
  });

  test("a nested backtick expression captures the outer parameter without a global trigger", () => {
    const source = "function inspect899(value)\n print(value)\n local callback = function() return `Value: {value}.` end\n return callback()\nend\n";
    expect(messages(source)).toEqual([]);
  });

  test("a backtick expression reads the inner local and retains its real parameter shadow", () => {
    const source = "function inspect899(value)\n local value = 2\n print(value)\n return `Value: {value}.`\nend\n";
    expect(messages(source)).toEqual(["Variable 'value' shadows previous declaration at line 1"]);
  });

  test("scene narrative reads the shadowing authored local without adding a global shadow", () => {
    const source = "scene inspect899(value)\n & local value = 2\n & print(value)\n Value: {value}.\nend\n";
    expect(messages(source)).toEqual(["Variable 'value' shadows previous declaration at line 1"]);
  });
});
