// #401: a Luau block inside a define ends when the next line declares a scene
// or branch. Only a line that starts with `scene` or `branch` declares one, so
// a table key, a parameter or a variable with that name leaves the block open
// and keeps every value where it was written.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const URI = "file:///main.sd";

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: URI } } as never).program as any;
}

function defaults(text: string) {
  return compile(text).context?.["settings"]?.["$default"];
}

describe("scene and branch as names inside a define", () => {
  it.each([
    ['{ scene = "" }', { scene: "" }],
    ['{ scene = "", x = 1 }', { scene: "", x: 1 }],
    ['{ x = 1, scene = "" }', { x: 1, scene: "" }],
    ['{ scene = "none", x = 1 }', { scene: "none", x: 1 }],
    ['{ x = 1, scene = " " }', { x: 1, scene: " " }],
    ['{ branch = "b", x = 1 }', { branch: "b", x: 1 }],
    ['{ scene = "s", branch = "b", x = 1 }', { scene: "s", branch: "b", x: 1 }],
  ])("t = %s keeps every field in the table", (literal, expected) => {
    const settings = defaults(
      ["define settings with", `  t = ${literal}`, "  y = 2", "end", ""].join(
        "\n",
      ),
    );
    expect(settings?.t).toEqual(expected);
    expect(settings?.y).toBe(2);
    expect(settings).not.toHaveProperty("x");
    expect(settings).not.toHaveProperty("scene");
    expect(settings).not.toHaveProperty("branch");
  });

  it("a define directly followed by a scene declaration still ends there", () => {
    const program = compile(
      [
        "-> start",
        "define settings with",
        "  t = { x = 1 }",
        "scene start",
        ":",
        "  Hello.",
        "end",
        "",
      ].join("\n"),
    );
    expect(program.context?.["settings"]?.["$default"]?.t).toEqual({ x: 1 });
    expect(run(program).output).toContain("Hello.");
  });
});

describe("scene and branch as names inside a function", () => {
  it("a parameter and a local with those names stay in the function body", () => {
    const program = compile(
      [
        "-> start",
        "function echo(scene)",
        "  local branch = scene",
        "  return branch",
        "end",
        "scene start",
        ":",
        '  Got {echo("ok")}.',
        "end",
        "",
      ].join("\n"),
    );
    const { output, errors } = run(program);
    expect(errors).toEqual([]);
    expect(output).toContain("Got ok.");
  });
});

function run(program: any) {
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  const errors: string[] = [];
  story.onError = (message: string) => {
    errors.push(message);
  };
  return { output: story.ContinueMaximally(), errors };
}
