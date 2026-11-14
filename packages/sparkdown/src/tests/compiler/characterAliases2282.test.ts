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
  return {
    program,
    diagnostics: (program.diagnostics?.[URI] ?? []).map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      text:
        d.range.start.line === d.range.end.line
          ? lines[d.range.start.line]!.slice(d.range.start.character, d.range.end.character)
          : "",
    })),
  };
}

const RAFFLES = (aliases: string) => `define raffles as character with
  name = "RAFFLES"
  aliases = ${aliases}
end

define bunny as character with
  name = "BUNNY"
end
`;

const scene = (cues: string) => `
scene start
${cues}end
`;

describe("`aliases` on a character (#2282)", () => {
  test("compiles as a list of strings, and a cue under an alias names the character with no warning", () => {
    const { program, diagnostics } = diagnosticsOf(
      RAFFLES(`{ "STRANGER", 'STRANGER?' }`) + scene(`  STRANGER:\n    Hello.\n  STRANGER? (O.S.) [<]:\n    Bunny--?\n`),
    );
    expect(diagnostics).toEqual([]);
    expect(program.context?.["character"]?.["raffles"]?.aliases).toEqual(["STRANGER", "STRANGER?"]);
  });

  test("a cue that is no character's name or alias still cannot find its character", () => {
    const { diagnostics } = diagnosticsOf(RAFFLES(`{ "STRANGER" }`) + scene(`  Stranger:\n    Hello.\n`));
    expect(diagnostics).toEqual([
      { message: "Cannot find character named `Stranger`", severity: 2, text: "Stranger" },
    ]);
  });

  test.each([
    ["a value that is not a string", `{ "STRANGER", 3 }`, "3", "An alias is a quoted name in a list"],
    ["a value that is not a list", `"STRANGER"`, `"STRANGER"`, "An alias is a quoted name in a list"],
    ["an empty alias", `{ "STRANGER", "" }`, `""`, "An alias cannot be empty"],
    ["the character's own `name`", `{ "RAFFLES" }`, "RAFFLES", "`RAFFLES` already names this character"],
    ["the character's own define name", `{ "raffles" }`, "raffles", "`raffles` already names this character"],
    ["another character's `name`", `{ "BUNNY" }`, "BUNNY", "`BUNNY` names the character `bunny`, so it cannot be an alias of `raffles`"],
    ["another character's define name", `{ "bunny" }`, "bunny", "`bunny` names the character `bunny`, so it cannot be an alias of `raffles`"],
  ])("%s is an error on the alias", (_label, aliases, text, message) => {
    const { diagnostics } = diagnosticsOf(RAFFLES(aliases) + scene(`  Hello.\n`));
    expect(diagnostics).toEqual([{ message: expect.stringContaining(message), severity: 1, text }]);
  });

  test("the same alias twice in one list is an error on each", () => {
    const { diagnostics } = diagnosticsOf(
      RAFFLES(`{ "STRANGER", "STRANGER?", "STRANGER" }`) + scene(`  Hello.\n`),
    );
    expect(diagnostics).toEqual([
      { message: "`STRANGER` is listed more than once in these aliases", severity: 1, text: "STRANGER" },
      { message: "`STRANGER` is listed more than once in these aliases", severity: 1, text: "STRANGER" },
    ]);
  });

  test("a cue that is an alias of two characters warns that the line names neither, and does not warn that it cannot find a character", () => {
    const { diagnostics } = diagnosticsOf(
      `define raffles as character with
  name = "RAFFLES"
  aliases = { "???" }
end

define bunny as character with
  name = "BUNNY"
  aliases = { "???" }
end
` + scene(`  ???:\n    You don't remember me?\n`),
    );
    expect(diagnostics).toEqual([
      {
        message: "`???` is an alias of `raffles` and `bunny`, so this line names none of them",
        severity: 2,
        text: "???",
      },
    ]);
  });
});
