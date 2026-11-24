import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compile(source: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const diagnostics: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      diagnostics.push(
        typeof raw === "string" ? raw : (raw?.value ?? JSON.stringify(d)),
      );
    }
  }
  return { program: result.program, diagnostics };
}

const MENU = `function play() end

function go_back() end

screen menu {
  panel {
    header { text "My Game" }
    slot
  }
}

layout title in menu {
  button "Play" @click=play
}

layout settings in menu {
  button "Back" @click=go_back
}

scene start
end
`;

describe("a screen's body holds elements and a slot", () => {
  test("the body compiles to the screen's children with the slot in place", () => {
    const { program, diagnostics } = compile(MENU);
    expect(diagnostics).toEqual([]);
    expect(program.sparkle?.screens?.["menu"]).toEqual({
      kind: "screen",
      name: "menu",
      children: [
        {
          kind: "element",
          tag: "panel",
          classes: [],
          props: {},
          events: [],
          children: [
            {
              kind: "element",
              tag: "header",
              classes: [],
              props: {},
              events: [],
              children: [
                {
                  kind: "element",
                  tag: "text",
                  classes: [],
                  props: {},
                  events: [],
                  children: [],
                  content: [{ kind: "literal", text: "My Game" }],
                },
              ],
            },
            { kind: "slot" },
          ],
        },
      ],
    });
    expect(program.sparkle?.layouts?.["title"]?.screen).toBe("menu");
  });

  test("a screen with an empty body compiles as before", () => {
    const { program, diagnostics } = compile(`screen menu {
}

layout title in menu {
  text "Title"
}

scene start
end
`);
    expect(diagnostics).toEqual([]);
    expect(program.sparkle?.screens?.["menu"]).toEqual({
      kind: "screen",
      name: "menu",
    });
  });
});
