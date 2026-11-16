import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { Editor, expectParity, openRegistry } from "./incrementalParity";

const URI = "inmemory:///main.sd";

const script = (line: string) =>
  ["scene start", "  choose", line, "      Body.", "      done", "  end", "end", "scene next", "  Next.", "  done", "end", ""].join("\n");

const diagnostics = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" } as any],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  return (program.diagnostics?.[URI] ?? []).map((d: any) => ({
    message: (typeof d.message === "string" ? d.message : d.message.value) as string,
    line: d.range.start.line as number,
    from: d.range.start.character as number,
    to: d.range.end.character as number,
  }));
};

const missingAudio = (text: string) =>
  diagnostics(text)
    .flatMap(({ message }) => message.match(/^Cannot find audio named `([^`]+)`/)?.[1] ?? [])
    .sort();

describe("a directive in a choice line is read over the text the story hands the interpreter (I-2225)", () => {
  test.each([
    ["    + Go ((a {[[a]]} b)) now", []],
    ["    + Go *far ((a {[=[a]=]} b)) away* now", []],
    ["    + Go ((a {t[1]} b)) now -> next", ["a", "b"]],
    ["    + Go ((a [x] /* c */ b)) now", []],
    ["    + Go ((a [b)) c] d", []],
    ["    + Go ((a b)) [x] now", ["a", "b"]],
    ["    + Go [x] ((a b)) now", ["a", "b"]],
    ["    + Go [((a b))] now", ["a", "b"]],
    ["    + Go ((a [x)) y] z)) now", []],
    ["    + Go ((a [x] # note)) now", []],
    [`    + Go ((a [x] {true and "x" or "y"} b)) now`, []],
  ])("`%s` warns about %j (I-2337)", (line, names) => {
    expect(missingAudio(script(line))).toEqual(names);
  });

  test.each([
    "    + Go ((a loop garbage)) [x] now",
    "    + Go ((a over soon)) [x] now",
  ])("`%s` reports each problem once though the menu and the chosen text both read it", (line) => {
    const found = diagnostics(script(line)).map(({ message, line: at, from, to }) => `${at}:${from}-${to} ${message}`);
    expect(found.length).toBeGreaterThan(1);
    expect(found.filter((entry, index) => found.indexOf(entry) !== index)).toEqual([]);
  });

  test.each([
    ["the name after the choice brackets", "    + Go ((a {[[a]]} b)) now", "b))", "c))"],
    ["a word added after the choice brackets", "    + Go ((a {t[1]} b)) now", "b))", "b d))"],
    ["the closer after the choice brackets", "    + Go ((a [x] b)) now", "b))", "b)"],
    ["the choice bracket's own closer", "    + Go ((a {[[a]]} b)) now", "]]}", "]}"],
    ["the name before the choice brackets", "    + Go ((a {t[1]} b)) now", "((a", "((z"],
    ["an interpolation typed after the choice brackets", "    + Go ((a [x] b)) now", "b))", "{v} b))"],
    ["a tag typed after the choice brackets", "    + Go ((a [x] b)) now", "b))", "# b))"],
    ["a closer typed inside the choice brackets", "    + Go ((a [x] z)) now", "[x]", "[x)) y]"],
  ])("editing %s re-reads the directive as a fresh parse does", (label, line, from, to) => {
    const text = script(line);
    const registry = openRegistry(URI, text);
    const editor = new Editor(registry, URI, text);
    const at = text.indexOf(from);
    editor.replace(at, at + from.length, to);
    expectParity(registry, URI, editor.text, label);
  });
});
