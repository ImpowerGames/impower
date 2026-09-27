import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// A second global declaration of a name is refused as a duplicate and never
// generated. Resolution still walks it, so it must not throw on the runtime
// objects that generation would have made: a throw ends resolution for the
// rest of the script and hides every error below it. The duplicate itself is
// reported at the declaration that repeats the name.

const MAIN = "file://proj/main.sd";

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

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

/** Every diagnostic in the entry file as `L<line>:<character> <message>`. */
const listed = (program: any): string[] =>
  ((program.diagnostics?.[MAIN] ?? []) as any[]).map(
    (d) => `L${d.range.start.line}:${d.range.start.character} ${message(d)}`,
  );

const DEFINE = ["define thing with", "  x = 1", "end", ""];
const STORE = ["store thing = 1", ""];
const SCENE = ["scene s0", "  Hi.", "  -> nowhere", "end", ""];

const duplicatesAt = (lines: string[]) =>
  lines.filter((l) => /Duplicate identifier `thing`/.test(l));

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("a name declared twice", () => {
  it("still reports the errors below a store followed by a define", () => {
    const lines = listed(compile([...STORE, ...DEFINE, ...SCENE].join("\n")));
    expect(lines).toContain("L8:5 target not found: `-> nowhere`");
    // The duplicate is the define on line 2, the second declaration.
    expect(duplicatesAt(lines).map((l) => l.split(" ")[0])).toEqual(["L2:7"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below two defines", () => {
    const lines = listed(compile([...DEFINE, ...DEFINE, ...SCENE].join("\n")));
    expect(lines).toContain("L10:5 target not found: `-> nowhere`");
    expect(duplicatesAt(lines).map((l) => l.split(" ")[0])).toEqual(["L4:7"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below two defines and a store", () => {
    const lines = listed(
      compile([...DEFINE, ...DEFINE, ...STORE, ...SCENE].join("\n")),
    );
    expect(lines).toContain("L12:5 target not found: `-> nowhere`");
    expect(duplicatesAt(lines).map((l) => l.split(" ")[0])).toEqual([
      "L4:7",
      "L8:6",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below a define followed by a store", () => {
    const lines = listed(compile([...DEFINE, ...STORE, ...SCENE].join("\n")));
    expect(lines).toContain("L8:5 target not found: `-> nowhere`");
    expect(duplicatesAt(lines).map((l) => l.split(" ")[0])).toEqual(["L4:6"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below two stores initialized by a call", () => {
    const lines = listed(
      compile(
        [
          "store thing = math.max(1, 2)",
          "store thing = math.max(1, 2)",
          "",
          ...SCENE,
        ].join("\n"),
      ),
    );
    expect(lines).toContain("L5:5 target not found: `-> nowhere`");
    expect(duplicatesAt(lines).map((l) => l.split(" ")[0])).toEqual(["L1:6"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("reports only the divert when the name is declared once", () => {
    const lines = listed(compile([...DEFINE, ...SCENE].join("\n")));
    expect(lines).toEqual(["L6:5 target not found: `-> nowhere`"]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
