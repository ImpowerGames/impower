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

  test("interpolated content lowers to ordered literal + binding parts", () => {
    const ast = screenAst(`screen hud with
  text = "HP: {hp} / {max_hp}"
end
`);
    const text = ast.hud.children[0];
    expect(text.tag).toBe("text");
    expect(text.content).toEqual([
      { kind: "literal", text: "HP: " },
      {
        kind: "binding",
        binding: {
          exprId: expect.stringMatching(/^__binding_\d+$/),
          source: "{hp}",
          span: expect.objectContaining({ from: expect.any(Number) }),
        },
      },
      { kind: "literal", text: " / " },
      {
        kind: "binding",
        binding: {
          exprId: expect.stringMatching(/^__binding_\d+$/),
          source: "{max_hp}",
          span: expect.objectContaining({ from: expect.any(Number) }),
        },
      },
    ]);
    // Each binding gets its own evaluator id (distinct source positions).
    expect(text.content[1].binding.exprId).not.toBe(
      text.content[3].binding.exprId,
    );
  });

  test("adjacency content `tag \"...\"` lowers to an element with content", () => {
    const ast = screenAst(`screen main with
  stage:
    image "black"
    text "HP: {hp}"
end
`);
    const stage = ast.main.children[0];
    expect(stage.tag).toBe("stage");
    const [img, txt] = stage.children;
    expect(img.tag).toBe("image");
    expect(img.content).toEqual([{ kind: "literal", text: "black" }]);
    expect(txt.tag).toBe("text");
    expect(txt.content).toEqual([
      { kind: "literal", text: "HP: " },
      {
        kind: "binding",
        binding: {
          exprId: expect.stringMatching(/^__binding_\d+$/),
          source: "{hp}",
          span: expect.objectContaining({ from: expect.any(Number) }),
        },
      },
    ]);
  });

  test("literal `{{`/`}}` brace escapes collapse, no binding emitted", () => {
    const ast = screenAst(`screen hud with
  text = "literal {{braces}} kept"
end
`);
    expect(ast.hud.children[0].content).toEqual([
      { kind: "literal", text: "literal {braces} kept" },
    ]);
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
