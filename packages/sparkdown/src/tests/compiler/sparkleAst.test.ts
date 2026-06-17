import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

function screenAst(source: string): any {
  const entries = compileSource(source);
  const screen = entries.find((e) => e.block?.sparkle?.screens);
  return screen?.block?.sparkle?.screens;
}

describe("reactive sparkle AST", () => {
  test("screen body lowers to a typed element tree (read from grammar tokens)", () => {
    const ast = screenAst(`screen main with
  stage:
    backdrop:
      image = "black"
    portrait:
      mask shadow_1
      image
    choice 0:
      text
end
`);
    expect(ast).toEqual({
      main: {
        kind: "screen",
        name: "main",
        children: [
          {
            kind: "element",
            tag: "stage",
            classes: [],
            props: {},
            events: [],
            children: [
              {
                kind: "element",
                tag: "backdrop",
                classes: [],
                props: {},
                events: [],
                children: [
                  {
                    kind: "element",
                    tag: "image",
                    classes: [],
                    content: [{ kind: "literal", text: "black" }],
                    props: {},
                    events: [],
                    children: [],
                  },
                ],
              },
              {
                kind: "element",
                tag: "portrait",
                classes: [],
                props: {},
                events: [],
                children: [
                  {
                    kind: "element",
                    tag: "mask",
                    classes: ["shadow_1"],
                    props: {},
                    events: [],
                    children: [],
                  },
                  {
                    kind: "element",
                    tag: "image",
                    classes: [],
                    props: {},
                    events: [],
                    children: [],
                  },
                ],
              },
              {
                kind: "element",
                tag: "choice",
                classes: ["0"],
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
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  test("`as PARENT` carries inheritance onto the screen node", () => {
    const ast = screenAst(`screen pause as main with
  text
end
`);
    expect(ast.pause.extends).toBe("main");
    expect(ast.pause.children[0].tag).toBe("text");
  });
});
