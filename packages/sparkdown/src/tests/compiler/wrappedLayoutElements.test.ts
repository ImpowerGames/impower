import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

type UiType = "layout" | "component";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "span" || k === "exprId") continue;
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
}

function lowered(source: string, type: UiType, name: string) {
  const entry = compileSource(source).find(
    (e) => e.block?.context?.[type]?.[name],
  );
  const sparkle =
    type === "layout"
      ? entry?.block?.sparkle?.layouts?.[name]
      : entry?.block?.sparkle?.components?.[name];
  return {
    struct: entry?.block?.context?.[type]?.[name],
    tree: normalize(sparkle) as any,
  };
}

function everything(source: string) {
  return compileSource(source)
    .filter(
      (e) => e.block?.context?.["layout"] || e.block?.context?.["component"],
    )
    .map((e) => ({
      context: e.block?.context,
      sparkle: normalize(e.block?.sparkle),
    }));
}

const URI = "file:///main.sd";

interface Found {
  message: string;
  severity: number | undefined;
  line: number;
  character: number;
  text: string;
}

function diagnosticsOf(text: string): Found[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: `${text}\nscene start\nend\n`,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? []).map((d) => {
    const { start, end } = d.range;
    return {
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      line: start.line,
      character: start.character,
      text:
        start.line === end.line
          ? lines[start.line]!.slice(start.character, end.character)
          : lines[start.line]!.slice(start.character),
    };
  });
}

const errorsOf = (text: string) =>
  diagnosticsOf(text).filter((d) => d.severity === 1);

const STATE = `store score = 0
store combo = 0
store best = 0
function go()
  score = 1
end
component card(title) {
  column.card {
    text.title "{title}"
    slot
  }
}
`;

describe("an element's parts on later lines", () => {
  const WRAPPED = `    button
      .fancy
      .large
      #bg-color=green
      #width={score}
      "Okay {score}"
      @click=go
      @input={ combo = 1 }
    {
      text "Confirm"
      color = white
    }`;
  const ONE_LINE = `    button.fancy.large #bg-color=green #width={score} "Okay {score}" @click=go @input={ combo = 1 } {
      text "Confirm"
      color = white
    }`;

  test.each([
    [
      "at the top of a layout body",
      (el: string) => `layout hud {\n${el}\n  text "after"\n}\n`,
    ],
    [
      "inside a block",
      (el: string) =>
        `layout hud {\n  column {\n${el}\n    text "after"\n  }\n}\n`,
    ],
    [
      "in an indented `if` branch",
      (el: string) =>
        `layout hud {\n  if score > 0 then\n${el}\n  end\n  text "after"\n}\n`,
    ],
    [
      "in a `for` branch inside a block",
      (el: string) =>
        `layout hud {\n  column {\n    for i in {1, 2} do\n${el}\n    end\n  }\n}\n`,
    ],
    [
      "in a component body",
      (el: string) =>
        `component tile(label) {\n  row {\n${el}\n  }\n  text "{label}"\n}\n`,
    ],
  ])("%s lower as the one-line element", (_name, wrap) => {
    const wrapped = everything(`${STATE}\n${wrap(WRAPPED)}`);
    const oneLine = everything(`${STATE}\n${wrap(ONE_LINE)}`);
    expect(wrapped).toEqual(oneLine);
    expect(errorsOf(`${STATE}\n${wrap(WRAPPED)}`)).toEqual([]);
  });

  test("the element takes every part, its block and its block's props", () => {
    const { tree, struct } = lowered(
      `${STATE}\nlayout hud {\n${WRAPPED}\n}\n`,
      "layout",
      "hud",
    );
    const [button] = tree.children;
    expect(button.tag).toBe("button");
    expect(button.classes).toEqual(["fancy", "large"]);
    expect(button.content.map((p: any) => p.kind)).toEqual(["literal", "binding"]);
    expect(Object.keys(button.props)).toEqual(["bg-color", "width", "color"]);
    expect(button.events.map((e: any) => [e.event, e.handler.kind])).toEqual([
      ["click", "ref"],
      ["input", "closure"],
    ]);
    expect(button.children.map((c: any) => c.content[0].text)).toEqual(["Confirm"]);
    expect(struct['button fancy large "Okay {score}"']).toEqual({
      text: "Confirm",
      color: "white",
    });
  });

  test("a leaf element's later content is its static value", () => {
    const wrapped = `layout hud {\n  text\n    .title\n    "Inventory"\n  image\n    #src=a.png\n}\n`;
    const oneLine = `layout hud {\n  text.title "Inventory"\n  image #src=a.png\n}\n`;
    expect(everything(wrapped)).toEqual(everything(oneLine));
    expect(lowered(wrapped, "layout", "hud").struct["text title"]).toBe("Inventory");
  });

  test("a component call, a `fill` and a parts line that ends with the block", () => {
    const wrapped = `${STATE}
layout hud {
  card("Inventory")
    .wide
  {
    fill
    {
      text "filled"
    }
  }
  button
    "Go" {
      text "child"
    }
}
`;
    const oneLine = `${STATE}
layout hud {
  card("Inventory").wide {
    fill { text "filled" }
  }
  button "Go" { text "child" }
}
`;
    expect(everything(wrapped)).toEqual(everything(oneLine));
    expect(errorsOf(wrapped)).toEqual([]);
  });
});

describe("where a wrapped element ends", () => {
  test("inside a block, a bare word on the next line starts a new element", () => {
    const { tree } = lowered(
      `layout hud {\n  column {\n    text\n    image\n      .icon\n  }\n}\n`,
      "layout",
      "hud",
    );
    const [column] = tree.children;
    expect(column.children.map((c: any) => [c.tag, c.classes])).toEqual([
      ["text", []],
      ["image", ["icon"]],
    ]);
  });

  test("a `name = value` line after an element is a property of the enclosing block", () => {
    const text = `layout hud {
  column {
    text
      "a"
    color = white
    .after
  }
}
`;
    const { tree, struct } = lowered(text, "layout", "hud");
    const [column] = tree.children;
    expect(column.props).toEqual({ color: { kind: "literal", value: "white" } });
    expect(column.children).toHaveLength(1);
    expect(column.children[0].props).toEqual({});
    expect(column.children[0].classes).toEqual([]);
    expect(struct.column).toEqual({ text: "a", color: "white" });
    expect(errorsOf(text).map((e) => [e.line, e.text, e.message.split(".")[0]])).toEqual([
      [5, ".after", "There is no element for this line to continue"],
    ]);
  });

  test("a property with a quoted key is a property, and ends the element before it", () => {
    const text = `layout hud {
  column {
    button
    "color" = white
    .after
  }
}
`;
    const { tree, struct } = lowered(text, "layout", "hud");
    const [column] = tree.children;
    expect(column.children).toHaveLength(1);
    expect(column.children[0]).toMatchObject({ tag: "button", classes: [] });
    expect(column.children[0].content).toBeUndefined();
    expect(column.props).toEqual({});
    expect(struct.column.button).toEqual({});
    expect(errorsOf(text).map((e) => [e.line, e.text, e.message.split(".")[0]])).toEqual([
      [4, ".after", "There is no element for this line to continue"],
    ]);
  });

  test("a control block, a block, a stray `-` or header, and the declaration's `}` end it", () => {
    const text = `store busy = false
layout hud {
  column {
    text
    if busy then
      spinner
    end
    "after if"
    row { stroke }
    #after-block=1
    image
    row:
    @click=go
  }
  text "last"
}

layout tail {
  text "a"
}
.after_end
`;
    const strays = errorsOf(text)
      .filter((e) => e.message.startsWith("There is no element"))
      .map((e) => e.text);
    expect(strays).toEqual(['"after if"', "#after-block=1", "@click=go"]);
    const [column] = lowered(text, "layout", "hud").tree.children;
    expect(column.children.map((c: any) => [c.kind, c.tag, c.classes ?? []])).toEqual([
      ["element", "text", []],
      ["if", undefined, []],
      ["element", "row", []],
      ["element", "image", []],
    ]);
    expect(lowered(text, "layout", "tail").tree.children).toHaveLength(1);
  });

  test("a comment or blank line between two parts does not end the element", () => {
    const wrapped = `layout hud {
  column {
    text
      .title
      -- a comment between parts
      // and another

      "Inventory"
  }
  image
    -- a comment
    #src=a.png
}
`;
    const oneLine = `layout hud {
  column {
    text.title "Inventory"
  }
  image #src=a.png
}
`;
    expect(everything(wrapped)).toEqual(everything(oneLine));
    expect(errorsOf(wrapped)).toEqual([]);
  });

  test("a slot's or a fill's name may stand on a continuation line", () => {
    const wrapped = `component card(title) {
  column {
    slot
      .footer
  }
  slot
    .header
}

layout hud {
  card("x") {
    fill
      .footer
    { text "Hi" }
  }
  card("y")
  {
    fill
      .footer
    {
      text "There"
    }
  }
}
`;
    const oneLine = `component card(title) {
  column {
    slot.footer
  }
  slot.header
}

layout hud {
  card("x") {
    fill.footer { text "Hi" }
  }
  card("y") {
    fill.footer { text "There" }
  }
}
`;
    expect(everything(wrapped)).toEqual(everything(oneLine));
    const card = lowered(wrapped, "component", "card").tree;
    expect(card.children[0].children[0]).toEqual({ kind: "slot", name: "footer" });
    expect(card.children[1]).toEqual({ kind: "slot", name: "header" });
    const [x, y] = lowered(wrapped, "layout", "hud").tree.children;
    expect(x.children[0].name).toBe("footer");
    expect(y.children[0].name).toBe("footer");
  });
});

describe("an event closure over several lines", () => {
  test("every statement lowers, wherever the closure starts", () => {
    const text = `${STATE}
layout hud {
  button "Go" @click={
    score = score + 1
    combo = combo + 2
  }
  column {
    button
      "Reset"
      @click={ -- reset everything
        if score > 10 then
          best = score
        else
          score = 0
        end
        combo = 0
      } .after #x=1
    text "after"
  }
}
`;
    expect(errorsOf(text)).toEqual([]);
    const { tree } = lowered(text, "layout", "hud");
    const [go, column] = tree.children;
    expect(go.content).toEqual([{ kind: "literal", text: "Go" }]);
    expect(go.events[0].handler.kind).toBe("closure");
    expect(go.events[0].handler.binding.source).toBe(
      "{\n    score = score + 1\n    combo = combo + 2\n  }",
    );
    const [reset, after] = column.children;
    expect(reset.classes).toEqual(["after"]);
    expect(reset.props).toEqual({ x: { kind: "literal", value: 1 } });
    expect(reset.events[0].handler.binding.source).toContain("combo = 0\n      }");
    expect(after.content).toEqual([{ kind: "literal", text: "after" }]);
  });

  test("a long string, a long comment or a backtick interpolation on the closure's first line keeps it open", () => {
    const tick = "`";
    const text = `store message = ""
layout hud {
  button "Set" @click={ message = [=[ready]=]
    message = message .. "!"
  }
  button "Tick" @click={ message = ${tick}{message} and {[[x]]}${tick}
    message = message .. "?"
  }
  button "Note" @click={ --[==[ a note ]==] message = "a"
    message = message .. "b"
  }
}
`;
    expect(errorsOf(text)).toEqual([]);
    const { tree } = lowered(text, "layout", "hud");
    const sources = tree.children.map((c: any) => c.events[0].handler.binding.source);
    expect(sources).toEqual([
      '{ message = [=[ready]=]\n    message = message .. "!"\n  }',
      `{ message = ${tick}{message} and {[[x]]}${tick}\n    message = message .. "?"\n  }`,
      '{ --[==[ a note ]==] message = "a"\n    message = message .. "b"\n  }',
    ]);
  });

  test("parts glued to a closure's closing `}` are read as on one line", () => {
    const wrapped = `${STATE}
layout hud {
  column {
    button @click={
      score = 1
    }"Hi"
    button @click={
      score = 2
    } .wide #x=1 "There" {
      text "child"
    }
    button @click={
      score = 3
    }.glued
    text "after"
  }
}
`;
    const oneLine = `${STATE}
layout hud {
  column {
    button @click={ score = 1 }"Hi"
    button @click={ score = 2 } .wide #x=1 "There" {
      text "child"
    }
    button @click={ score = 3 } .glued
    text "after"
  }
}
`;
    expect(errorsOf(wrapped)).toEqual([]);
    const strip = (v: any) => JSON.parse(JSON.stringify(v, (k, x) => (k === "source" ? undefined : x)));
    expect(strip(everything(wrapped))).toEqual(strip(everything(oneLine)));
    const [hi, there, glued] = lowered(wrapped, "layout", "hud").tree.children[0].children;
    expect(hi.content).toEqual([{ kind: "literal", text: "Hi" }]);
    expect(there.classes).toEqual(["wide"]);
    expect(there.children.map((c: any) => c.content[0].text)).toEqual(["child"]);
    expect(glued.classes).toEqual(["glued"]);
  });

  test("a closure the line closes is read as before", () => {
    const text = `${STATE}
layout hud {
  button @click={ score = 1 } "Go"
  row { button @click={ combo = 1 } "In"; text "after" }
}
`;
    const { tree } = lowered(text, "layout", "hud");
    expect(tree.children[0].events[0].handler.binding.source).toBe("{ score = 1 }");
    expect(tree.children[1].children.map((c: any) => c.tag)).toEqual(["button", "text"]);
    expect(errorsOf(text)).toEqual([]);
  });

});
