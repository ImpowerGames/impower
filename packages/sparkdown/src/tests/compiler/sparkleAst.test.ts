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

  test("`@event=handler` lowers to EventBindings (ref + call)", () => {
    const ast = screenAst(`screen hud with
  row:
    button "Use" @click=use_item
    button "Hit" @click=take_damage(10)
end
`);
    const [useBtn, hitBtn] = ast.hud.children[0].children;
    expect(useBtn.tag).toBe("button");
    expect(useBtn.content).toEqual([{ kind: "literal", text: "Use" }]);
    expect(useBtn.events).toEqual([
      { event: "click", handler: { kind: "ref", name: "use_item" } },
    ]);
    expect(hitBtn.events).toEqual([
      {
        event: "click",
        handler: {
          kind: "call",
          binding: {
            exprId: expect.stringMatching(/^__binding_\d+$/),
            source: "take_damage(10)",
            span: expect.objectContaining({ from: expect.any(Number) }),
          },
        },
      },
    ]);
  });

  test("`#prop=value` lowers to literal + binding PropValues (header/marker/adjacency)", () => {
    const ast = screenAst(`screen panel with
  column #gap=16:
    image #src="icon.png"
    text "hi" #opacity=0.5 #color={team_color}
end
`);
    const column = ast.panel.children[0];
    expect(column.tag).toBe("column");
    expect(column.props).toEqual({ gap: { kind: "literal", value: 16 } });
    const [img, txt] = column.children;
    expect(img.tag).toBe("image");
    expect(img.props).toEqual({ src: { kind: "literal", value: "icon.png" } });
    expect(txt.tag).toBe("text");
    expect(txt.props).toEqual({
      opacity: { kind: "literal", value: 0.5 },
      color: {
        kind: "binding",
        binding: {
          exprId: expect.stringMatching(/^__binding_\d+$/),
          source: "{team_color}",
          span: expect.objectContaining({ from: expect.any(Number) }),
        },
      },
    });
  });

  test("classes are bare words; the builtin token is the tag (position-independent)", () => {
    const ast = screenAst(`screen main with
  stage:
    mask shadow_1
    shadow_1 mask
    text title "Inventory"
end
`);
    const [m1, m2, txt] = ast.main.children[0].children;
    expect(m1).toMatchObject({ tag: "mask", classes: ["shadow_1"] });
    // Tag is the builtin regardless of position.
    expect(m2).toMatchObject({ tag: "mask", classes: ["shadow_1"] });
    // Class + adjacency content on one element line.
    expect(txt.tag).toBe("text");
    expect(txt.classes).toEqual(["title"]);
    expect(txt.content).toEqual([{ kind: "literal", text: "Inventory" }]);
  });

  test("class + adjacency content + trailing attribute coexist on one line", () => {
    const ast = screenAst(`screen main with
  stage:
    button primary "Use" @click=use_item
    label big "HP: {hp}" #color={team_color}
end
`);
    const [btn, lbl] = ast.main.children[0].children;
    expect(btn).toMatchObject({ tag: "button", classes: ["primary"] });
    expect(btn.content).toEqual([{ kind: "literal", text: "Use" }]);
    expect(btn.events).toEqual([
      { event: "click", handler: { kind: "ref", name: "use_item" } },
    ]);
    expect(lbl).toMatchObject({ tag: "label", classes: ["big"] });
    expect(lbl.content).toEqual([
      { kind: "literal", text: "HP: " },
      {
        kind: "binding",
        binding: expect.objectContaining({ source: "{hp}" }),
      },
    ]);
    expect(lbl.props.color).toEqual({
      kind: "binding",
      binding: expect.objectContaining({ source: "{team_color}" }),
    });
  });

  test("if/elseif/else lowers to an IfNode (branches + else, grammar children)", () => {
    const ast = screenAst(`screen hud with
  stage:
    if player.dead then
      text "GAME OVER"
    elseif player.hp < 10 then
      text "Low"
    else
      text "OK"
    end
end
`);
    const stage = ast.hud.children[0];
    expect(stage.tag).toBe("stage");
    const ifNode = stage.children[0];
    expect(ifNode.kind).toBe("if");
    expect(ifNode.branches).toHaveLength(2);
    expect(ifNode.branches[0].condition.source).toContain("player.dead");
    expect(ifNode.branches[0].children[0]).toMatchObject({
      tag: "text",
      content: [{ kind: "literal", text: "GAME OVER" }],
    });
    expect(ifNode.branches[1].condition.source).toContain("player.hp");
    expect(ifNode.branches[1].children[0].content).toEqual([
      { kind: "literal", text: "Low" },
    ]);
    expect(ifNode.else[0].content).toEqual([{ kind: "literal", text: "OK" }]);
  });

  test("`if` with no else omits the else branch", () => {
    const ast = screenAst(`screen hud with
  if ready then
    text "Go"
  end
end
`);
    const ifNode = ast.hud.children[0];
    expect(ifNode.kind).toBe("if");
    expect(ifNode.branches).toHaveLength(1);
    expect(ifNode.else).toBeUndefined();
    expect(ifNode.branches[0].children[0].content).toEqual([
      { kind: "literal", text: "Go" },
    ]);
  });

  test("for...in...do...else lowers to a ForNode (bindings + each + else)", () => {
    const ast = screenAst(`screen bag with
  for item in inventory do
    text "{item.name}"
  else
    text "empty"
  end
end
`);
    const forNode = ast.bag.children[0];
    expect(forNode.kind).toBe("for");
    expect(forNode.bindings).toEqual(["item"]);
    expect(forNode.each.source).toContain("inventory");
    expect(forNode.children[0].tag).toBe("text");
    expect(forNode.children[0].content[0]).toEqual({
      kind: "binding",
      binding: expect.objectContaining({ source: "{item.name}" }),
    });
    expect(forNode.else[0].content).toEqual([{ kind: "literal", text: "empty" }]);
  });

  test("for with two bindings (`k, v`) and no else", () => {
    const ast = screenAst(`screen t with
  for k, v in scores do
    text "{k}"
  end
end
`);
    const forNode = ast.t.children[0];
    expect(forNode.kind).toBe("for");
    expect(forNode.bindings).toEqual(["k", "v"]);
    expect(forNode.each.source).toContain("scores");
    expect(forNode.else).toBeUndefined();
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
