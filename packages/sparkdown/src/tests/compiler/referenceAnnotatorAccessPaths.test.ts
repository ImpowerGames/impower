import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

interface Ref {
  from: number;
  text: string;
  symbolIds?: string[];
  root?: number;
}

const URI = "file:///access.sd";

function referencesOf(registry: SparkdownDocumentRegistry, source: string): Ref[] {
  const out: Ref[] = [];
  const cur = registry.annotations(URI).references.iter();
  while (cur.value) {
    const { symbolIds, root } = cur.value.type;
    out.push({
      from: cur.from,
      text: source.slice(cur.from, cur.to),
      symbolIds,
      ...(root == null ? {} : { root: cur.from - root }),
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

function offsetOf(source: string, needle: string, occurrence = 1): number {
  let offset = -1;
  for (let i = 0; i < occurrence; i++) {
    offset = source.indexOf(needle, offset + 1);
  }
  return offset;
}

function at(refs: Ref[], source: string, needle: string, occurrence = 1): Ref | undefined {
  const offset = offsetOf(source, needle, occurrence);
  return refs.find((r) => r.from === offset);
}

function edit(source: string, find: string, replace: string) {
  const registry = registryOf(source);
  const offset = source.indexOf(find);
  const position = (to: number) => {
    const before = source.slice(0, to).split("\n");
    return { line: before.length - 1, character: before.at(-1)!.length };
  };
  registry.update({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: position(offset), end: position(offset + find.length) }, text: replace }],
  });
  const edited = source.slice(0, offset) + replace + source.slice(offset + find.length);
  return { edited, incremental: referencesOf(registry, edited) };
}

describe("ReferenceAnnotator · access paths (I-1969)", () => {
  test("every segment of a static access path is annotated with the path up to it and its root", () => {
    const source = "scene s\n  {character.raffles.name}\nend\n";
    const refs = collect(source);
    const root = offsetOf(source, "character");
    expect(at(refs, source, "raffles")).toMatchObject({ symbolIds: ["character.raffles"], root });
    expect(at(refs, source, "name")).toMatchObject({ symbolIds: ["character.raffles.name"], root });
    expect(at(refs, source, "character")?.root).toBeUndefined();
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
    ["one pair of parentheses", "{(character).raffles.name}"],
    ["nested parentheses", "{((character)).raffles.name}"],
    ["a parenthesized continuation", "{((character).raffles).name}"],
    ["a parenthesized segment", "{(character.raffles).name}"],
  ])("a path continues through %s", (_, expression) => {
    const source = `scene s\n  ${expression}\nend\n`;
    const refs = collect(source);
    const root = offsetOf(source, "character");
    expect(at(refs, source, "raffles")).toMatchObject({ symbolIds: ["character.raffles"], root });
    expect(at(refs, source, "name")).toMatchObject({ symbolIds: ["character.raffles.name"], root });
  });

  test.each([
    ["one", "function show()\n  return character\n    .raffles.name\nend\n"],
    ["two", "function show()\n  return character\n    .raffles\n    .name\nend\n"],
  ])("a path continues across %s line continuation(s)", (_, source) => {
    const refs = collect(source);
    const root = offsetOf(source, "character");
    expect(at(refs, source, "raffles")).toMatchObject({ symbolIds: ["character.raffles"], root });
    expect(at(refs, source, "name")).toMatchObject({ symbolIds: ["character.raffles.name"], root });
  });

  test("a path in an explicit statement is annotated like any other", () => {
    const source = "scene s\n  & x = character.raffles.name\nend\n";
    const refs = collect(source);
    const root = offsetOf(source, "character");
    expect(at(refs, source, "raffles")).toMatchObject({ symbolIds: ["character.raffles"], root });
    expect(at(refs, source, "name")).toMatchObject({ symbolIds: ["character.raffles.name"], root });
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

  test("a path through a local is annotated like any other, its root resolved when it is read", () => {
    const source = "function cast_name()\n  local cast = character\n  return cast.raffles.name\nend\n";
    const refs = collect(source);
    expect(at(refs, source, "raffles")).toMatchObject({
      symbolIds: ["cast.raffles"],
      root: offsetOf(source, "cast.raffles"),
    });
  });
});

describe("ReferenceAnnotator · access paths stay equal to a fresh parse after edits (I-1969)", () => {
  const body = Array.from({ length: 40 }, (_, i) => `  local pad_${i} = ${i} + 1\n`).join("");
  const source = `scene s\n  Hi.\nend\nfunction show()\n${body}  return pad_1 + character.raffles.name\nend\n`;

  test.each([
    ["before the function", "Hi.", "Hello there, a longer line.\n  And another."],
    ["inside an initializer between a local and its use", "pad_20 = 20 + 1", "pad_20 = 20  + 1"],
    ["adding a local before the use", "pad_30 = 30 + 1", "character = 30"],
  ])("an edit %s", (_, find, replace) => {
    const { edited, incremental } = edit(source, find, replace);
    expect(incremental).toEqual(collect(edited));
  });
});
