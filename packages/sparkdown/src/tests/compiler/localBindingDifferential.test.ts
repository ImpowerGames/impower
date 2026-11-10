import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { collectLuauLints } from "../../compiler/lint/collectLuauLints";
import { type AstNode, visitAst } from "../../compiler/typecheck/Ast";
import { LocalBindings } from "../../compiler/utils/localBinding";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

interface Comparison {
  compared: number;
  misplaced: number;
  disagreements: string[];
}

function compare(text: string): Comparison {
  const uri = "file:///differential.sd";
  const registry = new SparkdownDocumentRegistry(["references"]);
  registry.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  const tree = registry.tree(uri)!;
  const read = (from: number, to: number) => text.slice(from, to);
  const lints = collectLuauLints(tree, read);
  const resolved = new Set<AstNode>();
  for (const { root, offsets } of lints.roots) {
    if ((offsets as unknown as { lines?: unknown }).lines === undefined) continue;
    visitAst(root, {
      visit: (node: AstNode) => {
        resolved.add(node);
        return true;
      },
    });
  }
  const declarations = new Map(lints.names.declarations.map((declaration) => [declaration.local, declaration.from]));
  const bindings = new LocalBindings(tree, read);
  const result: Comparison = { compared: 0, misplaced: 0, disagreements: [] };
  for (const reference of lints.names.references) {
    if (reference.inType || !resolved.has(reference.node)) {
      continue;
    }
    if (read(reference.from, reference.to) !== reference.name) {
      result.misplaced += 1;
      continue;
    }
    result.compared += 1;
    const compiler = reference.local ? (declarations.get(reference.local) ?? null) : null;
    const local = bindings.bindingOf(reference.from);
    if (compiler !== local) {
      const line = text.slice(0, reference.from).split("\n").length;
      const at = (offset: number | null) => (offset == null ? "global" : `line ${text.slice(0, offset).split("\n").length}`);
      result.disagreements.push(
        `line ${line}: ${reference.name} is ${at(compiler)} to the compiler and ${at(local)} to LocalBindings`,
      );
    }
  }
  return result;
}

function sparkdownSources(): string[] {
  return (readdirSync(join(REPOSITORY, "packages"), { recursive: true }) as string[])
    .map((path) => path.split("\\").join("/"))
    .filter((path) => path.endsWith(".sd") && !path.includes("node_modules/"))
    .sort();
}

const indent = (lines: string, by: string) =>
  lines
    .split("\n")
    .map((line) => (line ? by + line : line))
    .join("\n");

const FORMS: Record<string, string> = {
  "an initialized local": "local v = 1\nx = v",
  "a bare local": "local v\nx = v",
  "a bare local before a statement on its line": "local v x = v",
  "a second name in a local list": "local a, v = 1, 2\nx = v",
  "a name in a local's value list": "local a, b = 1, v\nx = v",
  "a typed local": "local v: number = 1\nx = v",
  "a local reading its outer name": "local v = v\nx = v",
  "a const": "const v = 1\nx = v",
  "a local function": "local function v()\n  return v\nend\nx = v()",
  "a function expression's parameter": "local f = function(v)\n  return v\nend\nx = v",
  "a nested function's capture": "local v = 1\nfunction g()\n  return v\nend",
  "if branches": "if c then\n  local v = 1\n  x = v\nelseif d then\n  x = v\nelse\n  x = v\nend\nx = v",
  "a do block": "do\n  local v = 1\n  x = v\nend\nx = v",
  "a while loop": "while c do\n  local v = 1\n  x = v\nend\nx = v",
  "a numeric for": "for v = 1, 3 do\n  x = v\nend\nx = v",
  "a typed numeric for": "for v: number = 1, 3 do\n  x = v\nend\nx = v",
  "a generic for": "for k, v in pairs(t) do\n  x = v\nend\nx = v",
  "a typed generic for": "for k: string, v: number in pairs(t) do\n  x = v\nend\nx = v",
  "a repeat loop": "repeat\n  local v = 1\nuntil v > 0\nx = v",
  "a parameter": "x = p",
};

const CONTAINERS: Record<string, (body: string) => string> = {
  "a function": (body) => `function f(p)\n${indent(body, "  ")}\nend\n`,
  "a type function": (body) => `type function F(p)\n${indent(body, "  ")}\n  return p\nend\n`,
  "a define method": (body) => `define D with\n  m(p)\n${indent(body, "    ")}\n  end\nend\n`,
  "a scene's one-line explicit statement": (body) =>
    `scene s(p)\n  & ${body
      .split("\n")
      .map((line) => line.trim())
      .join(" ")}\nend\n`,
  "a scene's explicit lines": (body) =>
    `scene s(p)\n${body
      .split("\n")
      .map((line) => `  & ${line.trim()}`)
      .join("\n")}\nend\n`,
};

const ONE_LINE_STATEMENTS = new Set([
  "an initialized local",
  "a bare local",
  "a bare local before a statement on its line",
  "a second name in a local list",
  "a name in a local's value list",
  "a typed local",
  "a local reading its outer name",
  "a parameter",
]);

describe("LocalBindings agrees with the compiler's name resolution (I-1969)", () => {
  const sources = sparkdownSources();

  test("the corpus holds the repository's Sparkdown sources", () => {
    expect(sources.length).toBeGreaterThan(500);
  });

  test.each(sources)("%s", (path) => {
    const text = readFileSync(join(REPOSITORY, "packages", path), "utf8").replace(/\r\n/g, "\n");
    expect(compare(text).disagreements).toEqual([]);
  });

  const generated = Object.entries(CONTAINERS).flatMap(([container, wrap]) =>
    Object.entries(FORMS)
      .filter(([form]) => container !== "a scene's explicit lines" || ONE_LINE_STATEMENTS.has(form))
      .map(([form, body]) => [`${form} in ${container}`, wrap(body)] as const),
  );

  test.each(generated)("%s", (name, source) => {
    const result = compare(source);
    expect(result.disagreements).toEqual([]);
    if (!name.endsWith(" in a define method")) {
      expect(result.compared).toBeGreaterThan(0);
    }
  });

  test("every generated form in a function is resolved by the compiler, so the comparison covers it", () => {
    for (const [form, body] of Object.entries(FORMS)) {
      expect(compare(CONTAINERS["a function"]!(body)).compared, form).toBeGreaterThan(0);
    }
  });

  test("each container compares reads, except the ones the compiler's name facts do not resolve", () => {
    const compared = Object.fromEntries(
      Object.entries(CONTAINERS).map(([container, wrap]) => [
        container,
        Object.values(FORMS).reduce((total, body) => total + compare(wrap(body)).compared, 0) > 0,
      ]),
    );
    expect(compared).toEqual({
      "a function": true,
      "a type function": true,
      "a define method": false,
      "a scene's one-line explicit statement": true,
      "a scene's explicit lines": true,
    });
  });

  test("no compared read is skipped because its recorded name differs from its source text", () => {
    const misplaced = [
      ...sources.map((path) => readFileSync(join(REPOSITORY, "packages", path), "utf8").replace(/\r\n/g, "\n")),
      ...generated.map(([, source]) => source),
    ].reduce((total, text) => total + compare(text).misplaced, 0);
    expect(misplaced).toBe(0);
  });
});
