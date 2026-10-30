import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

// A parameter, or a local declared inside a flow, shadows a top-level `store`
// of the same name as it shadows a `const` (#1177): references inside its
// scope read the local. A local at the story's own top level is refused
// (I-1673), and two declarations in one scope still collide.

const MAIN = "file://proj/main.sd";

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

const OTHER = "file://proj/other.sd";

const script = (uri: string, name: string, text: string) => ({
  uri,
  type: "script",
  name,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

const compile = (text: string, otherText?: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      script(MAIN, "main", text),
      ...(otherText === undefined ? [] : [script(OTHER, "other", otherText)]),
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
};

/**
 * Every error in every file as `L<line>:<character> <message>`, the
 * message cut after "already exists" (where the first declaration is named is
 * #453's concern).
 */
const errors = (text: string, otherText?: string): string[] =>
  Object.values(compile(text, otherText).diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map(
      (d) =>
        `L${d.range.start.line}:${d.range.start.character} ${message(d).replace(
          / already exists on .*$/,
          " already exists",
        )}`,
    );

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

describe("a local or parameter that shares a store's name", () => {
  it.each([
    [
      "a local in a scene",
      ["store health = 100", "", "scene start", "  local health = 10", "  Hi.", "end"],
    ],
    [
      "a local in a function",
      ["store health = 100", "", "function f()", "  local health = 10", "  return health", "end", "", "scene start", "end"],
    ],
    [
      "a parameter",
      ["store health = 100", "", "function f(health)", "  return health", "end", "", "scene start", "end"],
    ],
  ])("%s shadows it without an error", (_name, lines) => {
    expect(errors(lines.join("\n"))).toEqual([]);
  });

  it("a local in a scene shadows a store declared in another file", () => {
    expect(
      errors(
        ["scene start", "  local health = 10", "  Hi.", "end"].join("\n"),
        "store health = 100\n",
      ),
    ).toEqual([]);
  });

  it("reads the local inside its function and the store outside it", () => {
    const ctx = makeRuntimeStoryFromSource(
      "store health = 5\nscene start\n  Value {f(2)} {health}.\nend\nfunction f(n)\n  local health = n\n  return health\nend\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 2 5.\n");
  });

  it("refuses a local at the top level next to it, as any top-level local (I-1673)", () => {
    expect(
      errors(
        ["store health = 100", "local health = 10", "", "scene start", "end"].join("\n"),
      ),
    ).toContain(
      "L1:0 local declaration must be inside a scene, branch or function; use store or const at the top level",
    );
  });

  it("still reports a store declared in the same function as the local", () => {
    expect(
      errors(
        [
          "function f()",
          "  local health = 10",
          "  store health = 100",
          "  return health",
          "end",
          "",
          "scene start",
          "end",
        ].join("\n"),
      ),
    ).toEqual([
      "L2:8 Duplicate identifier `health`. A temp named `health` already exists",
    ]);
  });

  it("still reports two stores of one name", () => {
    expect(
      errors(
        [
          "store health = 100",
          "store health = 10",
          "",
          "scene start",
          "  Hi.",
          "end",
        ].join("\n"),
      ),
    ).toEqual([
      "L1:6 Duplicate identifier `health`. A var named `health` already exists",
    ]);
  });

  // Luau lets a second `local` of one name shadow the first in one scope, and
  // the compiler accepts it with no store in sight; a store changes nothing.
  it("treats two locals of one name in one scene as it does without the store", () => {
    const scene = [
      "scene start",
      "  local health = 10",
      "  local health = 20",
      "  Hi.",
      "end",
    ];
    expect(errors(["store health = 100", "", ...scene].join("\n"))).toEqual(
      errors(["store other = 100", "", ...scene].join("\n")),
    );
    expect(errors(["store health = 100", "", ...scene].join("\n"))).toEqual([]);
  });
});
