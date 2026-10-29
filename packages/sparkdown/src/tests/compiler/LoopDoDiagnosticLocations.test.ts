import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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
      "store n = 0",
      "-> s",
      "scene s",
      `  ${header}`,
      "    & n = n + 1",
      "  end",
      "  n is {n}.",
      "end",
      "",
    ].join("\n"),
    line: 3,
    character: 2,
  }),
  "at the top level": (header: string) => ({
    text: [
      "store n = 0",
      "",
      header,
      "  & n = n + 1",
      "end",
      "n is {n}.",
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
