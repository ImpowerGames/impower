import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

function diagnosticsOf(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? []).map((d) => ({
    message: typeof d.message === "string" ? d.message : d.message.value,
    severity: d.severity,
    line: d.range.start.line,
    text:
      d.range.start.line === d.range.end.line
        ? lines[d.range.start.line]!.slice(d.range.start.character, d.range.end.character)
        : "",
  }));
}

const DEFS = `define raffles as character with
  name = "RAFFLES"
  aliases = { "???" }
end

define bunny as character with
  name = "BUNNY"
  aliases = { "???" }
end
`;

const scene = (cues: string) => `${DEFS}
scene start
${cues}end
`;

describe("a cue that names its speaker with `as` (#2283)", () => {
  test("a shared alias, another character's `name` and an unknown shown name carry no warning when `as` names the speaker", () => {
    expect(
      diagnosticsOf(
        scene(
          `  ??? as raffles:\n    You don't remember me?\n` +
            `  ??? as bunny (O.S.) [<]:\n    It can't be.\n` +
            `  BUNNY as raffles:\n    I can do his voice, you know.\n` +
            `  Mr. Nobody as bunny: Hello.\n`,
        ),
      ),
    ).toEqual([]);
  });

  test("a word after `as` that names no character is warned about on that word", () => {
    const text = scene(`  ??? as stranger:\n    Hello.\n`);
    expect(diagnosticsOf(text)).toEqual([
      expect.objectContaining({ message: "Cannot find character named `stranger`", severity: 2, text: "stranger" }),
    ]);
  });

  test("the word after `as` is a define name only, so a character's `name` there is not found", () => {
    const text = scene(`  ??? as RAFFLES:\n    Hello.\n`);
    expect(diagnosticsOf(text)).toEqual([
      expect.objectContaining({ message: "Cannot find character named `RAFFLES`", severity: 2, text: "RAFFLES" }),
    ]);
  });

  test("a backslash before `as` keeps it part of the shown name, which is looked up whole", () => {
    const text = scene(`  Dressed \\as raffles:\n    Ho ho ho.\n`);
    expect(diagnosticsOf(text)).toEqual([
      expect.objectContaining({ message: "Cannot find character named `Dressed \\as raffles`", text: "Dressed \\as raffles" }),
    ]);
  });

  test("typing, changing and deleting `as` on a cue revalidates it as a cold compile does", () => {
    const configure = (compiler: SparkdownCompiler, source: string) =>
      compiler.configure({
        files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
      } as any);
    const messagesOf = (compiler: SparkdownCompiler) =>
      (compiler.compile({ textDocument: { uri: URI } }).program.diagnostics?.[URI] ?? []).map(
        (d) => `${d.range.start.line}:${d.range.start.character} ${typeof d.message === "string" ? d.message : d.message.value}`,
      );
    const cold = (source: string) => {
      const fresh = new SparkdownCompiler();
      configure(fresh, source);
      return messagesOf(fresh);
    };
    let current = scene(`  ???:\n    You don't remember me?\n`);
    const compiler = new SparkdownCompiler();
    configure(compiler, current);
    const edit = (find: string, replace: string, version: number) => {
      const offset = current.indexOf(find);
      const at = (o: number) => {
        const lines = current.slice(0, o).split("\n");
        return { line: lines.length - 1, character: lines.at(-1)!.length };
      };
      compiler.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [{ range: { start: at(offset), end: at(offset + find.length) }, text: replace }],
      } as any);
      current = current.slice(0, offset) + replace + current.slice(offset + find.length);
    };

    expect(messagesOf(compiler)).toEqual([expect.stringMatching(/^11:2 `\?\?\?` is an alias of/)]);
    edit("???:", "??? as raffles:", 2);
    expect(messagesOf(compiler)).toEqual([]);
    expect(cold(current)).toEqual([]);
    edit("as raffles:", "as stranger:", 3);
    const unknown = messagesOf(compiler);
    expect(unknown).toEqual(["11:9 Cannot find character named `stranger`"]);
    expect(unknown).toEqual(cold(current));
    edit("??? as stranger:", "???:", 4);
    const shared = messagesOf(compiler);
    expect(shared).toEqual([expect.stringMatching(/^11:2 `\?\?\?` is an alias of/)]);
    expect(shared).toEqual(cold(current));
  });

  test("the shared-alias warning hints at naming the speaker with `as`", () => {
    expect(diagnosticsOf(scene(`  ???:\n    You don't remember me?\n`))).toEqual([
      expect.objectContaining({
        message:
          "`???` is an alias of `raffles` and `bunny`, so this line names none of them: write `??? as raffles` or `??? as bunny` to say who speaks",
        severity: 2,
        text: "???",
      }),
    ]);
  });
});
