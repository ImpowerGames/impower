import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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

const listed = (program: any): string[] =>
  ((program.diagnostics?.[MAIN] ?? []) as any[]).map(
    (d) =>
      `L${d.range.start.line}:${d.range.start.character} ${message(d).replace(
        / already exists on .*$/,
        " already exists",
      )}`,
  );

const DEFINE = ["define thing with", "  x = 1", "end", ""];
const STORE = ["store thing = 1", ""];
const SCENE = ["scene s0", "  Hi.", "  -> nowhere", "end", ""];

const duplicate = (at: string, kind: string) =>
  `${at} Duplicate identifier \`thing\`. A ${kind} named \`thing\` already exists`;

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
    expect(lines).toEqual([
      duplicate("L2:7", "var"),
      "L8:5 target not found: `-> nowhere`",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below two defines", () => {
    const lines = listed(compile([...DEFINE, ...DEFINE, ...SCENE].join("\n")));
    expect(lines).toEqual([
      duplicate("L4:7", "var"),
      "L10:5 target not found: `-> nowhere`",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below two defines and a store", () => {
    const lines = listed(
      compile([...DEFINE, ...DEFINE, ...STORE, ...SCENE].join("\n")),
    );
    expect(lines).toEqual([
      duplicate("L4:7", "var"),
      duplicate("L8:6", "var"),
      "L12:5 target not found: `-> nowhere`",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below a define followed by a store", () => {
    const lines = listed(compile([...DEFINE, ...STORE, ...SCENE].join("\n")));
    expect(lines).toEqual([
      duplicate("L4:6", "var"),
      "L8:5 target not found: `-> nowhere`",
    ]);
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
    expect(lines).toEqual([
      duplicate("L1:6", "var"),
      "L5:5 target not found: `-> nowhere`",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below a store initialized by a call that repeats a const", () => {
    const lines = listed(
      compile(
        [
          "const thing = 1",
          "store thing = math.max(1, 2)",
          "",
          ...SCENE,
        ].join("\n"),
      ),
    );
    expect(lines).toEqual([
      duplicate("L1:6", "const"),
      "L5:5 target not found: `-> nowhere`",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still reports the errors below a define that repeats a const", () => {
    const lines = listed(
      compile(["const thing = 1", "", ...DEFINE, ...SCENE].join("\n")),
    );
    expect(lines).toEqual([
      duplicate("L2:7", "const"),
      "L8:5 target not found: `-> nowhere`",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("reports only the divert when the name is declared once", () => {
    const lines = listed(compile([...DEFINE, ...SCENE].join("\n")));
    expect(lines).toEqual(["L6:5 target not found: `-> nowhere`"]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
