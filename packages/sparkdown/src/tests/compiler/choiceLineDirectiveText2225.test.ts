import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { Editor, expectParity, openRegistry } from "./incrementalParity";

const URI = "inmemory:///main.sd";

const script = (line: string) =>
  ["scene start", "  choose", line, "      Body.", "      done", "  end", "end", "scene next", "  Next.", "  done", "end", ""].join("\n");

const missingAudio = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" } as any],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  return (program.diagnostics?.[URI] ?? [])
    .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value) as string)
    .flatMap((message) => message.match(/^Cannot find audio named `([^`]+)`/)?.[1] ?? [])
    .sort();
};

describe("a directive in a choice line is read over the text the story hands the interpreter (I-2225)", () => {
  test.each([
    ["    + Go ((a {[[a]]} b)) now", ["a", "b"]],
    ["    + Go *far ((a {[=[a]=]} b)) away* now", ["a", "b"]],
    ["    + Go ((a {t[1]} b)) now -> next", ["a", "b"]],
    ["    + Go ((a [x] /* c */ b)) now", ["a", "b"]],
    ["    + Go ((a [b)) c] d", ["a", "b"]],
    ["    + Go ((a b)) [x] now", ["a", "b"]],
  ])("`%s` warns about %j", (line, names) => {
    expect(missingAudio(script(line))).toEqual(names);
  });

  test.each([
    ["the name after the choice brackets", "    + Go ((a {[[a]]} b)) now", "b))", "c))"],
    ["a word added after the choice brackets", "    + Go ((a {t[1]} b)) now", "b))", "b d))"],
    ["the closer after the choice brackets", "    + Go ((a [x] b)) now", "b))", "b)"],
    ["the choice bracket's own closer", "    + Go ((a {[[a]]} b)) now", "]]}", "]}"],
    ["the name before the choice brackets", "    + Go ((a {t[1]} b)) now", "((a", "((z"],
  ])("editing %s re-reads the directive as a fresh parse does", (label, line, from, to) => {
    const text = script(line);
    const registry = openRegistry(URI, text);
    const editor = new Editor(registry, URI, text);
    const at = text.indexOf(from);
    editor.replace(at, at + from.length, to);
    expectParity(registry, URI, editor.text, label);
  });
});
