import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

// #1225: in a `layout` or `component` body an element's parts may go on over
// later lines (#1222). A line that starts with `.`, `#`, `@` or a quote
// continues the element above it, the element's `{` may sit on a later line,
// and an `@event={ … }` closure may span lines. A wrapped element lowers to
// the layout tree (`program.sparkle`) and the static struct
// (`program.context`) of the same element written on one line, ignoring
// source positions and the binding names derived from them.

type UiType = "layout" | "component";

/** A layout tree without source positions or the binding names derived
 *  from them. */
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

/** Both outputs of every layout and component a source declares. */
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

/** Every diagnostic a full compile reports, with the text it underlines. */
function diagnosticsOf(text: string): Found[] {
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
component card(title) with
  column.card {
    text.title "{title}"
    slot
  }
end
`;

describe("an element's parts on later lines", () => {
  // Each kind of part on a line of its own, and the `{` on a line of its own.
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
      (el: string) => `layout hud with\n${el}\n  text "after"\nend\n`,
    ],
    [
      "inside a block",
      (el: string) =>
        `layout hud with\n  column {\n${el}\n    text "after"\n  }\nend\n`,
    ],
    [
      "in an indented `if` branch",
      (el: string) =>
        `layout hud with\n  if score > 0 then\n${el}\n  end\n  text "after"\nend\n`,
    ],
    [
      "in a `for` branch inside a block",
      (el: string) =>
        `layout hud with\n  column {\n    for i in {1, 2} do\n${el}\n    end\n  }\nend\n`,
    ],
    [
      "in a component body",
      (el: string) =>
        `component tile(label) with\n  row {\n${el}\n  }\n  text "{label}"\nend\n`,
    ],
  ])("%s lower as the one-line element", (_name, wrap) => {
    const wrapped = everything(`${STATE}\n${wrap(WRAPPED)}`);
    const oneLine = everything(`${STATE}\n${wrap(ONE_LINE)}`);
    expect(wrapped).toEqual(oneLine);
    expect(errorsOf(`${STATE}\n${wrap(WRAPPED)}`)).toEqual([]);
  });

  test("the element takes every part, its block and its block's props", () => {
    const { tree, struct } = lowered(
      `${STATE}\nlayout hud with\n${WRAPPED}\nend\n`,
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
    // The static struct keys the element by its tag, classes and content, as
    // a one-line header with a block is keyed.
    expect(struct['button fancy large "Okay {score}"']).toEqual({
      text: "Confirm",
      color: "white",
    });
  });

  test("a leaf element's later content is its static value", () => {
    const wrapped = `layout hud with\n  text\n    .title\n    "Inventory"\n  image\n    #src=a.png\nend\n`;
    const oneLine = `layout hud with\n  text.title "Inventory"\n  image #src=a.png\nend\n`;
    expect(everything(wrapped)).toEqual(everything(oneLine));
    expect(lowered(wrapped, "layout", "hud").struct["text title"]).toBe("Inventory");
  });

  test("a component call, a `fill` and a parts line that ends with the block", () => {
    const wrapped = `${STATE}
layout hud with
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
end
`;
    const oneLine = `${STATE}
layout hud with
  card("Inventory").wide {
    fill { text "filled" }
  }
  button "Go" { text "child" }
end
`;
    expect(everything(wrapped)).toEqual(everything(oneLine));
    expect(errorsOf(wrapped)).toEqual([]);
  });
});

describe("where a wrapped element ends", () => {
  test("inside a block, a bare word on the next line starts a new element", () => {
    const { tree } = lowered(
      `layout hud with\n  column {\n    text\n    image\n      .icon\n  }\nend\n`,
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
    const text = `layout hud with
  column {
    text
      "a"
    color = white
    .after
  }
end
`;
    const { tree, struct } = lowered(text, "layout", "hud");
    const [column] = tree.children;
    expect(column.props).toEqual({ color: { kind: "literal", value: "white" } });
    expect(column.children).toHaveLength(1);
    expect(column.children[0].props).toEqual({});
    expect(column.children[0].classes).toEqual([]);
    expect(struct.column).toEqual({ text: "a", color: "white" });
    // The part after the property continues no element.
    expect(errorsOf(text).map((e) => [e.line, e.text, e.message.split(".")[0]])).toEqual([
      [5, ".after", "There is no element for this line to continue"],
    ]);
  });

  test("a property with a quoted key is a property, and ends the element before it", () => {
    // Round 1 (comment 5940793507, finding 1).
    const text = `layout hud with
  column {
    button
    "color" = white
    .after
  }
end
`;
    const { tree, struct } = lowered(text, "layout", "hud");
    const [column] = tree.children;
    expect(column.children).toHaveLength(1);
    expect(column.children[0]).toMatchObject({ tag: "button", classes: [] });
    expect(column.children[0].content).toBeUndefined();
    // A quoted key sets no layout prop, as on origin/main.
    expect(column.props).toEqual({});
    expect(struct.column.button).toEqual({});
    expect(errorsOf(text).map((e) => [e.line, e.text, e.message.split(".")[0]])).toEqual([
      [4, ".after", "There is no element for this line to continue"],
    ]);
  });

  test("a `}` that closes no block ends the element before it", () => {
    // Round 1 (comment 5940793507, finding 2).
    const text = `layout hud with
  text
  }
  .after
end
`;
    const [element] = lowered(text, "layout", "hud").tree.children;
    expect(element.classes).toEqual([]);
    expect(
      errorsOf(text)
        .map((e) => [e.line, e.text, e.message.split(".")[0]])
        .sort((a, b) => (a[0] as number) - (b[0] as number)),
    ).toEqual([
      [2, "}", "Invalid syntax"],
      [3, ".after", "There is no element for this line to continue"],
    ]);
  });

  test("a control block, a block, a stray `-` or header, and the declaration's `end` end it", () => {
    const text = `store busy = false
layout hud with
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
end

layout tail with
  text "a"
end
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
    // Past the declaration's `end`, a dotted line is display text, not part of
    // the layout.
    expect(lowered(text, "layout", "tail").tree.children).toHaveLength(1);
  });

  test("a comment or blank line between two parts does not end the element", () => {
    const wrapped = `layout hud with
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
end
`;
    const oneLine = `layout hud with
  column {
    text.title "Inventory"
  }
  image #src=a.png
end
`;
    expect(everything(wrapped)).toEqual(everything(oneLine));
    expect(errorsOf(wrapped)).toEqual([]);
  });

  test("a slot's or a fill's name may stand on a continuation line", () => {
    // Round 1 (comment 5940170624, finding 3).
    const wrapped = `component card(title) with
  column {
    slot
      .footer
  }
  slot
    .header
end

layout hud with
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
end
`;
    const oneLine = `component card(title) with
  column {
    slot.footer
  }
  slot.header
end

layout hud with
  card("x") {
    fill.footer { text "Hi" }
  }
  card("y") {
    fill.footer { text "There" }
  }
end
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
layout hud with
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
end
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
    // Round 1 (comment 5939804102): only `[[…]]` and interpolation-free
    // backtick strings were read on the first line, so these handlers were
    // cut at their first line and reported as missing their `}`.
    const tick = "`";
    const text = `store message = ""
layout hud with
  button "Set" @click={ message = [=[ready]=]
    message = message .. "!"
  }
  button "Tick" @click={ message = ${tick}{message} and {[[x]]}${tick}
    message = message .. "?"
  }
  button "Note" @click={ --[==[ a note ]==] message = "a"
    message = message .. "b"
  }
end
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
    // Round 1 (comment 5940170624, finding 2): the element ended at the
    // closure's `}` as it ends at its block's, and `"Hi"` was invalid.
    // (On one line a `.class` glued to a closed closure is read into the
    // handler's value, as #1224 reads an unquoted value; after a closure that
    // spans lines it is a class. The comparison below spaces it.)
    const wrapped = `${STATE}
layout hud with
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
end
`;
    const oneLine = `${STATE}
layout hud with
  column {
    button @click={ score = 1 }"Hi"
    button @click={ score = 2 } .wide #x=1 "There" {
      text "child"
    }
    button @click={ score = 3 } .glued
    text "after"
  }
end
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
layout hud with
  button @click={ score = 1 } "Go"
  row { button @click={ combo = 1 } "In"; text "after" }
end
`;
    const { tree } = lowered(text, "layout", "hud");
    expect(tree.children[0].events[0].handler.binding.source).toBe("{ score = 1 }");
    expect(tree.children[1].children.map((c: any) => c.tag)).toEqual(["button", "text"]);
    expect(errorsOf(text)).toEqual([]);
  });

  test("a closure with no closing `}` is reported on its `{`, and the next declaration compiles", () => {
    const text = `${STATE}
layout hud with
  button "Stop" @click={
    score = 0
  text "taken in"
end

layout next with
  text "compiles"
end
`;
    const errors = errorsOf(text);
    const lines = text.split("\n");
    const open = lines.findIndex((l) => l.includes("@click={"));
    expect(errors.map((e) => [e.line, e.character, e.text])).toEqual([
      [open, lines[open]!.indexOf("{"), "{"],
    ]);
    expect(errors[0]!.message).toMatch(/^This handler is missing its closing `\}`\./);
    expect(errors[0]!.message).not.toMatch(/one line/);
    expect(lowered(text, "layout", "next").tree.children[0].content).toEqual([
      { kind: "literal", text: "compiles" },
    ]);
  });
});
