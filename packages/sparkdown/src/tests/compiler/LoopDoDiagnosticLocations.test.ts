import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// A `while` or `for` loop written in a scene or at the top level without `do`
// has no body. Its header ends at its line (#1907), so Luau's reading meets its
// end of input where the `do` should be, and the error is Luau's, in Luau's
// words, at the end of the header's line (#1001 pinned a hint on the keyword
// before). These tests assert the file and the exact range, so the error stays
// on the line the author has to fix rather than drifting to another.

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

const MAIN = "file://proj/main.sd";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
};

/** Every missing-`do` diagnostic, flattened with its file. */
const missingDoDiagnostics = (program: any) =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, list]) =>
    (list as any[])
      .filter((d) => /Expected 'do' when parsing (?:while|for) loop/.test(message(d)))
      .map((d) => ({
        uri,
        message: message(d),
        severity: d.severity,
        range: d.range,
      })),
  );

const places = {
  "in a scene": (header: string) => ({
    text: [
      "store n = 0", // 0
      "-> s", // 1
      "scene s", // 2
      `  ${header}`, // 3
      "    & n = n + 1", // 4
      "  end", // 5
      "  n is {n}.", // 6
      "end",
      "",
    ].join("\n"),
    line: 3,
    character: 2,
  }),
  "at the top level": (header: string) => ({
    text: [
      "store n = 0", // 0
      "", // 1
      header, // 2
      "  & n = n + 1", // 3
      "end", // 4
      "n is {n}.", // 5
      "",
    ].join("\n"),
    line: 2,
    character: 0,
  }),
};

describe("the missing-do error's location", () => {
  for (const [place, wrap] of Object.entries(places)) {
    for (const [keyword, header] of [
      ["while", "while n < 2"],
      ["for", "for i = 1, 3"],
    ] as const) {
      it(`is the end of a ${keyword} loop's header line ${place}`, () => {
        const { text, line, character } = wrap(header);
        const found = missingDoDiagnostics(compile(text));

        expect(found).toEqual([
          {
            uri: MAIN,
            message: `Expected 'do' when parsing ${keyword} loop, got <eof>`,
            // An error (LSP severity 1), not a warning.
            severity: 1,
            range: {
              start: { line, character: character + header.length },
              end: { line: line + 1, character: 0 },
            },
          },
        ]);
      });
    }
  }
});
