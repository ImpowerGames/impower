import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

interface Ref {
  from: number;
  text: string;
  symbolIds?: string[];
  bound?: boolean;
  site?: number;
  declaration?: string;
}

const URI = "file:///access.sd";

function referencesOf(registry: SparkdownDocumentRegistry, source: string): Ref[] {
  const out: Ref[] = [];
  const cur = registry.annotations(URI).references.iter();
  while (cur.value) {
    const { symbolIds, binding, declaration } = cur.value.type;
    out.push({
      from: cur.from,
      text: source.slice(cur.from, cur.to),
      symbolIds,
      declaration,
      ...(binding == null ? {} : { bound: true, site: cur.from - binding }),
    });
    cur.next();
  }
  return out;
}

function registryOf(source: string) {
  const registry = new SparkdownDocumentRegistry(["references"]);
  registry.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  return registry;
}

function collect(source: string): Ref[] {
  return referencesOf(registryOf(source), source);
}

function at(refs: Ref[], source: string, needle: string, occurrence = 1): Ref | undefined {
  let offset = -1;
  for (let i = 0; i < occurrence; i++) {
    offset = source.indexOf(needle, offset + 1);
  }
  return refs.find((r) => r.from === offset);
}

describe("ReferenceAnnotator · access paths (I-1969)", () => {
  test("every segment of a static access path is annotated with the path up to it", () => {
    const source = "scene s\n  {character.raffles.name}\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "raffles")?.symbolIds).toEqual(["character.raffles"]);
    expect(at(refs, source, "name")?.symbolIds).toEqual(["character.raffles.name"]);
  });

  test("whitespace around a dot does not end the path", () => {
    const source = "scene s\n  {character . raffles . name}\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "raffles")?.symbolIds).toEqual(["character.raffles"]);
    expect(at(refs, source, "name")?.symbolIds).toEqual(["character.raffles.name"]);
  });

  test.each([
    ["a double-quoted", '{character["raffles"].name}'],
    ["a single-quoted", "{character['raffles'].name}"],
  ])("%s string index is a segment annotated over its name", (_, expression) => {
    const source = `scene s\n  ${expression}\nend\n`;
    const refs = collect(source);
    const segment = at(refs, source, "raffles");
    expect(segment?.text).toBe("raffles");
    expect(segment?.symbolIds).toEqual(["character.raffles"]);
    expect(at(refs, source, "name")?.symbolIds).toEqual(["character.raffles.name"]);
  });

  test.each([
    ["one pair", "{(character).raffles.name}"],
    ["nested pairs", "{((character)).raffles.name}"],
    ["a parenthesized continuation", "{((character).raffles).name}"],
    ["a parenthesized segment", "{(character.raffles).name}"],
  ])("a parenthesized root continues its path through %s of parentheses", (_, expression) => {
    const source = `scene s\n  ${expression}\nend\n`;
    const refs = collect(source);
    expect(at(refs, source, "raffles")?.symbolIds).toEqual(["character.raffles"]);
    expect(at(refs, source, "name")?.symbolIds).toEqual(["character.raffles.name"]);
  });

  test("a computed index ends the static path", () => {
    const source = "scene s\n  {character[who].name}\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "name")).toBeUndefined();
    expect(at(refs, source, "who")?.symbolIds).toEqual([".who", "who"]);
  });

  test("a call argument is its own path, and a property after the call is not a segment of it", () => {
    const source = "scene s\n  {f(bar).baz}\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "bar")?.symbolIds).toEqual([".bar", "bar"]);
    expect(refs.filter((r) => r.symbolIds?.some((id) => id.includes("baz")))).toEqual([]);
  });

  test("an interpolated string index is not a static segment", () => {
    const source = 'scene s\n  {character["a{b}"].name}\nend\n';
    const refs = collect(source);
    expect(at(refs, source, "name")).toBeUndefined();
  });
});

describe("ReferenceAnnotator · a use's root resolves to the binding in scope (I-1969)", () => {
  test("a parameter binds its name in the function, and the path through it is not annotated", () => {
    const source = "function show(settings)\n  return settings.score\nend\n";
    const refs = collect(source);
    const use = at(refs, source, "settings", 2);
    expect(use?.bound).toBe(true);
    expect(at(refs, source, "score")).toBeUndefined();
  });

  test("an anonymous function's parameter binds only inside that function", () => {
    const source =
      "function show()\n  local f = function(settings)\n    return settings.score\n  end\n  return settings.score\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.bound).toBe(true);
    expect(at(refs, source, "settings", 3)?.bound).toBeUndefined();
    expect(at(refs, source, "score", 2)?.symbolIds).toEqual(["settings.score"]);
  });

  test("a local binds its name in later statements of its block and of nested functions", () => {
    const source =
      "function outer()\n  local settings = {score = 2}\n  function inner()\n    return settings.score\n  end\n  return settings.score\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.bound).toBe(true);
    expect(at(refs, source, "settings", 3)?.bound).toBe(true);
  });

  test("a local does not bind its own initializer or statements before it", () => {
    const source =
      "function show()\n  local result = settings.score\n  local settings = settings\n  return result\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 1)?.bound).toBeUndefined();
    expect(at(refs, source, "settings", 3)?.bound).toBeUndefined();
  });

  test("a local whose block has ended no longer binds its name", () => {
    const source =
      "function show()\n  if true then\n    local settings = 1\n    x = settings\n  end\n  return settings.score\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.bound).toBe(true);
    expect(at(refs, source, "settings", 3)?.bound).toBeUndefined();
  });

  test("a local in one branch of an if binds later statements of that branch only", () => {
    const source =
      "function show()\n  if a then\n    local settings = 1\n    x = settings\n  elseif b then\n    local other = 2\n    x = settings.score\n  else\n    y = settings.score + other\n  end\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.bound).toBe(true);
    expect(at(refs, source, "settings", 3)?.bound).toBeUndefined();
    expect(at(refs, source, "settings", 4)?.bound).toBeUndefined();
    expect(at(refs, source, "other", 2)?.bound).toBeUndefined();
  });

  test("each use points at the declaration of the binding it resolves to, and distinct bindings stay distinct", () => {
    const source =
      "function a(settings)\n  local settings = settings\n  return settings\nend\nfunction b()\n  local settings = 3\n  return settings\nend\n";
    const refs = collect(source);
    const parameter = at(refs, source, "settings", 1)!;
    const firstLocal = at(refs, source, "settings", 2)!;
    const secondLocal = at(refs, source, "settings", 5)!;
    expect(parameter.site).toBe(parameter.from);
    expect(firstLocal.site).toBe(firstLocal.from);
    expect(secondLocal.site).toBe(secondLocal.from);
    expect(at(refs, source, "settings", 3)?.site).toBe(parameter.from);
    expect(at(refs, source, "settings", 4)?.site).toBe(firstLocal.from);
    expect(at(refs, source, "settings", 6)?.site).toBe(secondLocal.from);
  });

  test("a const in a function binds like a local, and a top-level local or const binds nothing", () => {
    const source =
      "const settings = 1\nfunction show()\n  const other = 2\n  const function helper()\n    return 1\n  end\n  return settings + other + helper()\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 1)?.bound).toBeUndefined();
    expect(at(refs, source, "settings", 2)?.bound).toBeUndefined();
    expect(at(refs, source, "other", 2)?.site).toBe(at(refs, source, "other", 1)?.from);
    expect(at(refs, source, "helper", 2)?.site).toBe(at(refs, source, "helper", 1)?.from);
  });

  test("calling a parameter or a local function resolves the call to that binding", () => {
    const source = "function show(callback)\n  return callback() + helper()\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "callback", 2)?.site).toBe(at(refs, source, "callback", 1)?.from);
    expect(at(refs, source, "helper", 1)?.bound).toBeUndefined();
    expect(at(refs, source, "helper", 1)?.symbolIds).toEqual(["helper"]);
  });

  test("a repeat body's local binds its until condition", () => {
    const source =
      "function show()\n  repeat\n    local settings = {score = 2}\n  until settings.score > 0\n  repeat\n    x = 1\n  until settings\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.site).toBe(at(refs, source, "settings", 1)?.from);
    expect(at(refs, source, "settings", 3)?.bound).toBeUndefined();
  });

  test("a local in one function does not bind the name in another", () => {
    const source =
      "function show()\n  local settings = 1\n  return settings\nend\nfunction other()\n  return settings.score\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.bound).toBe(true);
    expect(at(refs, source, "settings", 3)?.bound).toBeUndefined();
  });

  test.each([
    ["a generic for's variable", "function show(t)\n  for settings, v in pairs(t) do\n    x = settings.score\n  end\nend\n"],
    ["a numeric for's variable", "function show()\n  for settings = 1, 3 do\n    x = settings.score\n  end\nend\n"],
  ])("%s is bound where it is declared and in the loop body", (_, source) => {
    const refs = collect(source);
    expect(at(refs, source, "settings", 1)?.bound).toBe(true);
    expect(at(refs, source, "settings", 2)?.bound).toBe(true);
  });

  test("a loop variable does not bind the name after the loop", () => {
    const source = "function show()\n  for settings = 1, 3 do\n  end\n  x = settings.score\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.bound).toBeUndefined();
  });

  test("a local function binds its name in later statements", () => {
    const source = "function show()\n  local function settings()\n    return 1\n  end\n  x = settings.score\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings", 2)?.bound).toBe(true);
  });

  test("a local alias is bound, so a path through it is not attributed to a define", () => {
    const source =
      "function cast_name()\n  local cast = character\n  return cast.raffles.name\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "cast.raffles")?.bound).toBe(true);
    expect(refs.filter((r) => r.symbolIds?.includes("character.raffles"))).toEqual([]);
  });

  test("a top-level use outside any function is unbound", () => {
    const source = "scene s\n  {settings.score}\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "settings")?.bound).toBeUndefined();
    expect(at(refs, source, "score")?.symbolIds).toEqual(["settings.score"]);
  });

  test("an edit before a function keeps each use pointing at its binding", () => {
    let source =
      "scene s\n  Hi.\nend\nfunction show(callback)\n  local settings = 1\n  return settings + callback()\nend\n";
    const registry = registryOf(source);
    const find = "Hi.";
    const offset = source.indexOf(find);
    const replace = "Hello there, a longer line.\n  And another.";
    registry.update({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        { range: { start: { line: 1, character: 2 }, end: { line: 1, character: 2 + find.length } }, text: replace },
      ],
    });
    source = source.slice(0, offset) + replace + source.slice(offset + find.length);
    const incremental = referencesOf(registry, source);
    expect(at(incremental, source, "settings", 2)?.site).toBe(at(incremental, source, "settings", 1)?.from);
    expect(at(incremental, source, "callback", 2)?.site).toBe(at(incremental, source, "callback", 1)?.from);
    expect(incremental).toEqual(collect(source));
  });

  test("an edit that adds a local updates the binding of a later use outside the edited line", () => {
    const body = Array.from({ length: 60 }, (_, i) => `  v${i} = ${i}\n`).join("");
    let source = `scene s\n  Hi.\nend\nfunction show()\n${body}  return settings.score\nend\n`;
    const registry = registryOf(source);
    const find = "v30 = 30";
    const offset = source.indexOf(find);
    const replace = "local settings = 30";
    const line = source.slice(0, offset).split("\n").length - 1;
    registry.update({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: { start: { line, character: 2 }, end: { line, character: 2 + find.length } },
          text: replace,
        },
      ],
    });
    source = source.slice(0, offset) + replace + source.slice(offset + find.length);
    const incremental = referencesOf(registry, source);
    expect(at(incremental, source, "settings", 2)?.bound).toBe(true);
    expect(at(incremental, source, "score")).toBeUndefined();
    expect(incremental).toEqual(collect(source));
  });
});
