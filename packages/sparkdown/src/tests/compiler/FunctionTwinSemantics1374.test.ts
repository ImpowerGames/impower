import "../../inkjs/engine/Container";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///function-twin-semantics.sd";
const channels = ["semantics", "references", "declarations"] as const;
const builtin = { tokenType: "function", tokenModifiers: ["defaultLibrary"] };
const variable = { tokenType: "variable", tokenModifiers: [] };
const callable = { tokenType: "function", tokenModifiers: [] };

function open(text: string) {
  const registry = new SparkdownDocumentRegistry([...channels]);
  registry.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  // Ingestion accepts CRLF, but tree and annotation offsets use normalized LF.
  expect(registry.get(URI)!.getText()).toBe(text.replace(/\r\n/g, "\n"));
  return registry;
}

function at(registry: SparkdownDocumentRegistry, channel: typeof channels[number], from: number, name: string) {
  const found: unknown[] = [];
  registry.annotations(URI)![channel]!.between(from, from + name.length, (start, end, value) => {
    if (start === from && end === from + name.length) found.push(value.type);
  });
  return found;
}

function snapshot(registry: SparkdownDocumentRegistry) {
  return channels.flatMap(channel => {
    const result: string[] = [];
    const iter = registry.annotations(URI)![channel]!.iter();
    while (iter.value) {
      result.push(`${channel}:${iter.from}:${iter.to}:${JSON.stringify(iter.value.type)}`);
      iter.next();
    }
    return result;
  });
}

function position(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
}

function edit(registry: SparkdownDocumentRegistry, text: string, from: number, removed: string, inserted: string, version: number) {
  expect(text.slice(from, from + removed.length)).toBe(removed);
  registry.update({
    textDocument: { uri: URI, version },
    contentChanges: [{ range: { start: position(text, from), end: position(text, from + removed.length) }, text: inserted }],
  });
  return text.slice(0, from) + inserted + text.slice(from + removed.length);
}

function expectParity(registry: SparkdownDocumentRegistry, text: string) {
  const cold = open(text);
  expect(registry.tree(URI)!.toString()).toBe(cold.tree(URI)!.toString());
  expect(snapshot(registry)).toEqual(snapshot(cold));
}

const contexts = [
  ["canonical LF", "", "\n"],
  ["bounded LF", "& ", "\n"],
  ["canonical CRLF", "", "\r\n"],
  ["bounded CRLF", "& ", "\r\n"],
] as const;

describe.each(contexts)("function semantic identity: %s", (_label, prefix, newline) => {
  test.each(["function f", "type function F"])("%s contains its parameters and locals", declaration => {
    const line = `${prefix}${declaration}(print) local math = 1 return print end`;
    const source = [line, "& print(1)", "& local after = math.pi", "Following."].join(newline);
    const registry = open(source);
    const text = registry.get(URI)!.getText();
    expect(at(registry, "semantics", text.indexOf("return print") + 7, "print")).toEqual([variable]);
    expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
    expect(at(registry, "semantics", text.lastIndexOf("math"), "math")).toEqual([
      { tokenType: "namespace", tokenModifiers: ["defaultLibrary"] },
    ]);
    const parameter = text.indexOf("(print") + 1;
    const functionName = declaration.startsWith("type") ? "F" : "f";
    expect(at(registry, "references", parameter, "print")).toEqual([
      { declaration: "param", symbolIds: [`${functionName}.print`], kind: "write" },
    ]);
  });

  test("an anonymous function initializer remains callable without leaking its parameter", () => {
    const source = [
      `${prefix}store callback = function(print) return print end`,
      "& callback(1)", "& print(1)", "Following.",
    ].join(newline);
    const registry = open(source);
    const text = registry.get(URI)!.getText();
    expect(at(registry, "semantics", text.lastIndexOf("callback"), "callback")).toEqual([callable]);
    expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
  });

  test("a nested function restores the outer parameter then the builtin", () => {
    const source = [
      `${prefix}function outer(print) local function inner(print) return print end return print end`,
      "& print(1)", "Following.",
    ].join(newline);
    const registry = open(source);
    const text = registry.get(URI)!.getText();
    const returns = [...text.matchAll(/return print/g)];
    expect(returns).toHaveLength(2);
    for (const match of returns) expect(at(registry, "semantics", match.index! + 7, "print")).toEqual([variable]);
    expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
    const innerParameter = text.indexOf("inner(print") + "inner(".length;
    expect(at(registry, "references", innerParameter, "print")).toEqual([
      { declaration: "param", symbolIds: ["inner.print"], kind: "write" },
    ]);
  });

  test.each(["function f", "type function F"])("%s parameter references retain their qualified symbol identity", declaration => {
    const source = `${prefix}${declaration}(argument) return argument end${newline}Following.`;
    const registry = open(source);
    const text = registry.get(URI)!.getText();
    const parameter = text.indexOf("(argument") + 1;
    const functionName = declaration.startsWith("type") ? "F" : "f";
    expect(at(registry, "references", parameter, "argument")).toEqual([
      { declaration: "param", symbolIds: [`${functionName}.argument`], kind: "write" },
    ]);
  });
});

describe.each(contexts)("incremental function semantic identity: %s", (_label, prefix, newline) => {
  // Closed scene headers and root `end` nodes provide pure packet split
  // points (Packet.add), unlike one uninterrupted plain-text tail. A prefix
  // also keeps the binding edit away from the first document packet.
  const padding = Array.from({ length: 60 }, (_, i) => [
    `scene padding_${i}`, `  Padding ${i}.`, "end", "",
  ]).flat();
  const fixture = (declaration: string, following: string) => [
    "Prelude.", "", declaration, "", ...padding, following, "Following.",
  ].join(newline);

  test.each(["function f", "type function F"])("renaming a %s parameter cannot shadow a distant builtin", declaration => {
    let text = fixture(`${prefix}${declaration}(spare) return 1 end`, "& print(1)");
    const registry = open(text);
    text = registry.get(URI)!.getText();
    expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
    const from = text.indexOf("spare");
    for (const [step, names] of [["spare", "print"], ["print", "spare"]].entries()) {
      text = edit(registry, text, from, names[0]!, names[1]!, step + 2);
      const span = registry.tree(URI)!.prop(cachedCompilerProp);
      expect(span?.reparsedTo, "the distant reference must be outside a finite annotation window").toBeTypeOf("number");
      expect(span!.reparsedTo!).toBeLessThan(text.lastIndexOf("print"));
      expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
      expectParity(registry, text);
    }
  });

  test("a local rename cannot change a distant builtin reference", () => {
    let text = fixture(`${prefix}function f() local spare = 1 return 1 end`, "& print(1)");
    const registry = open(text);
    text = registry.get(URI)!.getText();
    expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
    text = edit(registry, text, text.indexOf("spare"), "spare", "print", 2);
    const span = registry.tree(URI)!.prop(cachedCompilerProp);
    expect(span?.reparsedTo).toBeTypeOf("number");
    expect(span!.reparsedTo!).toBeLessThan(text.lastIndexOf("print"));
    expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
    expectParity(registry, text);
  });

  test("replaying a closed function keeps a later edit in the global frame", () => {
    const first = `${prefix}function f(print) return print end`;
    let text = fixture(first, "& print(1)");
    const registry = open(text);
    text = registry.get(URI)!.getText();
    expect(at(registry, "semantics", text.indexOf("return print") + 7, "print")).toEqual([variable]);
    const argument = text.lastIndexOf("print(1)") + "print(".length;
    text = edit(registry, text, argument, "1", "2", 2);
    const span = registry.tree(URI)!.prop(cachedCompilerProp);
    expect(span?.reparsedFrom).toBeTypeOf("number");
    expect(span!.reparsedFrom!).toBeGreaterThan(text.indexOf(first) + first.length);
    expect(at(registry, "semantics", text.lastIndexOf("print"), "print")).toEqual([builtin]);
    expectParity(registry, text);
  });

  test("changing a global initializer to a function updates a carried reference and undo", () => {
    let text = fixture(`${prefix}store callback = 0`, "{callback}");
    const registry = open(text);
    text = registry.get(URI)!.getText();
    expect(at(registry, "semantics", text.lastIndexOf("callback"), "callback")).toEqual([variable]);
    const from = text.indexOf("= 0") + 2;
    const body = "function() return 1 end";
    for (const [step, change] of [["0", body], [body, "0"]].entries()) {
      text = edit(registry, text, from, change[0]!, change[1]!, step + 2);
      const span = registry.tree(URI)!.prop(cachedCompilerProp);
      expect(span?.reparsedTo).toBeTypeOf("number");
      expect(span!.reparsedTo!).toBeLessThan(text.lastIndexOf("callback"));
      expect(at(registry, "semantics", text.lastIndexOf("callback"), "callback")).toEqual([step === 0 ? callable : variable]);
      expectParity(registry, text);
    }
  });
});
