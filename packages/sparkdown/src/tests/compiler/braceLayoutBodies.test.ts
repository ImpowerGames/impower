import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

// #1224: `layout` and `component` bodies accept brace blocks and dotted
// classes (#1222). A brace body lowers to the layout tree
// (`program.sparkle`) and the static struct (`program.context`) its indented
// form lowers to, ignoring source positions and the binding names derived
// from them.


type UiType = "layout" | "component";

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
      text:
        start.line === end.line
          ? lines[start.line]!.slice(start.character, end.character)
          : lines[start.line]!.slice(start.character),
    };
  });
}

const errorsOf = (text: string) =>
  diagnosticsOf(text).filter((d) => d.severity === 1);

describe("a brace body lowers as its multiline blocks", () => {
  test("nested blocks, classes, content and props", () => {
    const indented = lowered(
      `layout hud with
  column.panel #child-gap=8 {
    text.title "Inventory"
    row.item {
      image #src={icon}
      button "Use" @click=use_item
    }
    choice.0 {
      text
    }
    title {
      stroke
      text
    }
  }
end
`,
      "layout",
      "hud",
    );
    const braced = lowered(
      `layout hud with
  column.panel #child-gap=8 {
    text.title "Inventory"
    row.item {
      image #src={icon}
      button "Use" @click=use_item
    }
    choice.0 { text }
    title { stroke; text }
  }
end
`,
      "layout",
      "hud",
    );
    expect(indented.struct).toBeDefined();
    expect(braced.struct).toEqual(indented.struct);
    expect(braced.tree).toEqual(indented.tree);
  });

  test("`if`, `for` with `else` and `match` inside a block, with blocks in their branches", () => {
    const indented = `layout inventory with
  column.panel {
    if busy then
      text "busy"
    elseif done then
      row.done {
        text "done"
      }
    else
      text "idle"
    end
    for item in bag do
      row.item {
        image #src={item.icon}
        text "{item.name}"
        button "Use" @click=use_item(item)
      }
    else
      text.empty "Your bag is empty."
    end
    match mode do
      case 1
        row.one {
          text "one"
        }
      case 2
        text "two"
      else
        text "other"
    end
    text "after"
  }
end
`;
    const braced = `layout inventory with
  column.panel {
    if busy then
      text "busy"
    elseif done then
      row.done { text "done" }
    else
      text "idle"
    end
    for item in bag do
      row.item {
        image #src={item.icon}
        text "{item.name}"
        button "Use" @click=use_item(item)
      }
    else
      text.empty "Your bag is empty."
    end
    match mode do
      case 1
        row.one {
          text "one"
        }
      case 2
        text "two"
      else
        text "other"
    end
    text "after"
  }
end
`;
    const a = lowered(indented, "layout", "inventory");
    const b = lowered(braced, "layout", "inventory");
    expect(b.tree).toEqual(a.tree);
    expect(b.struct).toEqual(a.struct);
    // Every child is under the right parent.
    const column = b.tree.children[0];
    expect(column.children.map((c: any) => c.kind)).toEqual([
      "if",
      "for",
      "match",
      "element",
    ]);
    const [ifNode, forNode, matchNode] = column.children;
    expect(ifNode.branches[1].children[0].children[0].tag).toBe("text");
    expect(ifNode.else[0].tag).toBe("text");
    expect(forNode.children[0].classes).toEqual(["item"]);
    expect(forNode.children[0].children.map((c: any) => c.tag)).toEqual([
      "image",
      "text",
      "button",
    ]);
    expect(forNode.else[0].classes).toEqual(["empty"]);
    expect(matchNode.cases[0].children[0].children[0].tag).toBe("text");
    expect(matchNode.else[0].tag).toBe("text");
    expect(errorsOf(braced)).toEqual([]);
  });

  test("a component call with a block fills the default slot, and `fill footer { … }` the named one", () => {
    const indented = `component card(title) with
  column {
    text "{title}"
    slot
    slot.footer
  }
end

layout main with
  card("Inventory") {
    text "body"
    fill.footer {
      button "Ok"
    }
  }
end
`;
    const braced = `component card(title) with
  column {
    text "{title}"
    slot
    slot.footer
  }
end

layout main with
  card("Inventory") {
    text "body"
    fill.footer { button "Ok" }
  }
end
`;
    expect(everything(braced)).toEqual(everything(indented));
    const call = lowered(braced, "layout", "main").tree.children[0];
    expect(call.tag).toBe("card");
    expect(call.params).toHaveLength(1);
    expect(call.children[0].tag).toBe("text");
    expect(call.children[1]).toEqual({
      kind: "fill",
      name: "footer",
      children: [expect.objectContaining({ tag: "button" })],
    });
    const card = lowered(braced, "component", "card").tree.children[0];
    expect(card.children.slice(1)).toEqual([
      { kind: "slot" },
      { kind: "slot", name: "footer" },
    ]);
  });
});

describe("dotted classes", () => {
  test("`button.primary.large` is a button with two classes", () => {
    for (const source of [
      `layout hud with\n  button.primary.large "Save"\nend\n`,
      `layout hud with\n  row { button.primary.large "Save" }\nend\n`,
    ]) {
      const { tree, struct } = lowered(source, "layout", "hud");
      const button = source.includes("row")
        ? tree.children[0].children[0]
        : tree.children[0];
      expect(button.tag).toBe("button");
      expect(button.classes).toEqual(["primary", "large"]);
      const holder = source.includes("row") ? struct.row : struct;
      expect(holder["button primary large"]).toBe("Save");
    }
  });

  test("`choice.0 { text }` is keyed `choice 0` in the static struct", () => {
    const { struct, tree } = lowered(
      `layout hud with\n  choice.0 { text }\nend\n`,
      "layout",
      "hud",
    );
    expect(struct["choice 0"]).toEqual({ text: {} });
    expect(tree.children[0].tag).toBe("choice");
    expect(tree.children[0].classes).toEqual(["0"]);
  });

  test("a class written after a space is keyed as a glued one", () => {
    const glued = `layout hud with\n  choice.0 { text }\n  mask.shadow_1\n  row.a.b {\n    text\n  }\nend\n`;
    const spaced = `layout hud with\n  choice .0 { text }\n  mask .shadow_1\n  row .a .b {\n    text\n  }\nend\n`;
    expect(everything(spaced)).toEqual(everything(glued));
    expect(Object.keys(lowered(spaced, "layout", "hud").struct)).toEqual(
      expect.arrayContaining(["choice 0", "mask shadow_1", "row a b"]),
    );
    // An attribute or a comment between the name and a class leaves one space.
    const after = `layout hud with\n  column {\n    image @click=go .b\n    text #w=1 --[[ c ]] .h1 "Hi"\n  }\nend\n`;
    const before = `layout hud with\n  column {\n    image.b @click=go\n    text.h1 #w=1 "Hi"\n  }\nend\n`;
    expect(lowered(after, "layout", "hud").struct).toEqual(lowered(before, "layout", "hud").struct);
    expect(lowered(after, "layout", "hud").struct.column).toEqual({ "image b": {}, "text h1": "Hi" });
  });

  test("a dotted class is no longer warned about", () => {
    for (const source of [
      `layout main with\n  row.hud #gap=12 {\n    text "x"\n  }\nend\n`,
      `layout main with\n  text.title "Hi"\nend\n`,
      `layout main with\n  row.hud #gap=12 { text.title "x" }\nend\n`,
    ]) {
      expect(diagnosticsOf(source)).toEqual([]);
    }
  });

  test("a style selector keeps its dots", () => {
    const style = compileSource(
      `style card with\n  &.secondary {\n    color = blue\n  }\n  > text.label { color = red }\nend\n`,
    ).find((e) => e.block?.context?.["style"])?.block?.context?.["style"]?.[
      "card"
    ];
    expect(style["&.secondary"]).toEqual({ color: "blue" });
    expect(style["> text.label"]).toEqual({ color: "red" });
  });
});

describe("one-line blocks and the optional `=`", () => {
  test("`title { stroke; text }` has two children", () => {
    const { tree, struct } = lowered(
      `layout hud with\n  title { stroke; text }\nend\n`,
      "layout",
      "hud",
    );
    expect(tree.children[0].children.map((c: any) => c.tag)).toEqual([
      "stroke",
      "text",
    ]);
    expect(struct.title).toEqual({ stroke: {}, text: {} });
  });

  test("`row = { … }` lowers as `row { … }`", () => {
    expect(
      lowered(`layout hud with\n  row = { text "a" }\nend\n`, "layout", "hud"),
    ).toEqual(lowered(`layout hud with\n  row { text "a" }\nend\n`, "layout", "hud"));
  });

  test("`#value = {x}` is still a binding", () => {
    const { tree } = lowered(
      `layout hud with\n  row { input #value = {x} }\nend\n`,
      "layout",
      "hud",
    );
    const input = tree.children[0].children[0];
    expect(input.props.value.kind).toBe("binding");
    expect(input.props.value.binding.source).toBe("{x}");
  });

  test("an unquoted prop value or handler name ends at whitespace, `;` or `}`", () => {
    const { tree } = lowered(
      `layout hud with
  row { text "a" #width=5; text "b" }
  row { button @click=go; button @click=stop }
  column #gap=4 { text "c" }
  column #gap=4 .wide { text "d" }
  row { text #width=5}
end
`,
      "layout",
      "hud",
    );
    const [first, second, third, fourth, fifth] = tree.children;
    expect(first.children).toHaveLength(2);
    expect(first.children[0].props.width).toEqual({ kind: "literal", value: 5 });
    expect(first.children[1].content).toEqual([{ kind: "literal", text: "b" }]);
    expect(second.children.map((c: any) => c.events[0].handler)).toEqual([
      { kind: "ref", name: "go" },
      { kind: "ref", name: "stop" },
    ]);
    expect(third.props.gap).toEqual({ kind: "literal", value: 4 });
    expect(third.children[0].content).toEqual([{ kind: "literal", text: "c" }]);
    expect(fourth.classes).toEqual(["wide"]);
    expect(fourth.children).toHaveLength(1);
    expect(fifth.children[0].props.width).toEqual({ kind: "literal", value: 5 });
  });

  test("a brace inside a value's run is part of the value", () => {
    // The indented form reads `#label=a{b}` as one literal, so the brace
    // form does too; a block after a value needs whitespace before it.
    const text = `layout hud with
  text #label=a{b} { stroke }
  row { text #label=a{b}; text "next" }
end
`;
    const [label, row] = lowered(text, "layout", "hud").tree.children;
    expect(label.props.label).toEqual({ kind: "literal", value: "a{b}" });
    expect(label.children).toHaveLength(1);
    expect(row.children[0].props.label).toEqual({ kind: "literal", value: "a{b}" });
    expect(row.children[1].content).toEqual([{ kind: "literal", text: "next" }]);
    expect(errorsOf(text)).toEqual([]);
  });

  test("a comma after an unquoted prop value separates two entries, and is reported", () => {
    const text = `layout hud with\n  row { text "x" #y=1, text "z"; text #font=a,b }\nend\n`;
    const row = lowered(text, "layout", "hud").tree.children[0];
    expect(row.children.map((c: any) => c.content?.[0]?.text)).toEqual([
      "x",
      "z",
      undefined,
    ]);
    expect(row.children[0].props.y).toEqual({ kind: "literal", value: 1 });
    // A comma inside a value stays part of it.
    expect(row.children[2].props.font).toEqual({ kind: "literal", value: "a,b" });
    expect(errorsOf(text).map((e) => [e.message, e.text])).toEqual([
      ["Separate entries on one line with `;`, not `,`.", ","],
    ]);
  });

  test("attribute values nest calls three deep and bindings four deep", () => {
    const text = `layout hud with
  row {
    button "Go" @click=use(item, max(1, min(2, x))) .wide
    text #x={ {a = {b = {c = 1}}} } "after"
  }
end
`;
    const [button, label] = lowered(text, "layout", "hud").tree.children[0].children;
    expect(button.events[0].handler.binding.source).toBe(
      "use(item, max(1, min(2, x)))",
    );
    expect(button.classes).toEqual(["wide"]);
    expect(label.props.x.binding.source).toBe("{ {a = {b = {c = 1}}} }");
    expect(label.content).toEqual([{ kind: "literal", text: "after" }]);
    expect(errorsOf(text)).toEqual([]);
  });

  describe("a brace in an attribute's value, a string or a comment is never a block", () => {
    const closure = (button: any) => button.events[0].handler.binding.source;

    test("a closure with tables nested five deep, on an indented line and in a block", () => {
      const text = `layout hud with
  button "Go" @click={ local t = {a={b={c={}}}} }
  row { button "Go" @click={ local t = {a={b={c={}}}} }; text "after" }
end
`;
      const [button, row] = lowered(text, "layout", "hud").tree.children;
      expect(closure(button)).toBe("{ local t = {a={b={c={}}}} }");
      expect(button.children).toEqual([]);
      expect(closure(row.children[0])).toBe("{ local t = {a={b={c={}}}} }");
      expect(row.children[1].content).toEqual([{ kind: "literal", text: "after" }]);
      expect(errorsOf(text)).toEqual([]);
    });

    test("a single-quoted attribute value", () => {
      const text = `layout hud with
  text #--label='a{b}c'
  row { text #--label='a{b}c' "q" }
end
`;
      const [label, row] = lowered(text, "layout", "hud").tree.children;
      expect(label.props["--label"]).toEqual({ kind: "literal", value: "'a{b}c'" });
      expect(label.children).toEqual([]);
      expect(row.children[0].props["--label"]).toEqual({
        kind: "literal",
        value: "'a{b}c'",
      });
      expect(row.children[0].content).toEqual([{ kind: "literal", text: "q" }]);
      expect(errorsOf(text)).toEqual([]);
    });

    test("Luau long strings and long comments in a closure or a call", () => {
      const text = `component card(t) with
  text "{t}"
end

layout hud with
  button @click={ print([[a}b]]) }
  button @click={ hp = 1 --[[ } ]] ; hp = 2 }
  card([[a)b{c]])
  row { button @click={ print([==[a}b]==]) } "B"; text "after" }
end
`;
      const [print, comment, call, row] = lowered(text, "layout", "hud").tree.children;
      expect(closure(print)).toBe("{ print([[a}b]]) }");
      expect(closure(comment)).toBe("{ hp = 1 --[[ } ]] ; hp = 2 }");
      expect(call.params).toHaveLength(1);
      expect(call.children).toEqual([]);
      expect(closure(row.children[0])).toBe("{ print([==[a}b]==]) }");
      expect(row.children[1].content).toEqual([{ kind: "literal", text: "after" }]);
      expect(errorsOf(text)).toEqual([]);
    });

    test("a long string of any level, on an indented line and in a block", () => {
      const text = `layout hud with
  button @click={ print([====[a}b]====]) }
  row { button @click={ print([=======[a}b]=======]) } "Go"; text "after" }
end
`;
      const [button, row] = lowered(text, "layout", "hud").tree.children;
      expect(closure(button)).toBe("{ print([====[a}b]====]) }");
      expect(button.classes).toEqual([]);
      expect(closure(row.children[0])).toBe("{ print([=======[a}b]=======]) }");
      expect(row.children[0].content).toEqual([{ kind: "literal", text: "Go" }]);
      expect(row.children[1].content).toEqual([{ kind: "literal", text: "after" }]);
      expect(errorsOf(text)).toEqual([]);
    });

    test("calls nested six deep and closures nested eight deep keep the rest of the line", () => {
      const declarations = `component card(t) with
  slot
end

function f(x)
  return x
end
`;
      const braced = `${declarations}
layout hud with
  card(f(f(f(f(f(1)))))) { text "body" }
  row { button @click={ local t = {a={b={c={d={e={f={}}}}}}} } "Go"; text "after" }
end
`;
      const indented = `${declarations}
layout hud with
  card(f(f(f(f(f(1)))))) {
    text "body"
  }
  row {
    button @click={ local t = {a={b={c={d={e={f={}}}}}}} } "Go"
    text "after"
  }
end
`;
      expect(everything(braced)).toEqual(everything(indented));
      const [call, row] = lowered(braced, "layout", "hud").tree.children;
      expect(call.children.map((c: any) => c.content[0].text)).toEqual(["body"]);
      expect(row.children.map((c: any) => c.content[0].text)).toEqual([
        "Go",
        "after",
      ]);
      expect(errorsOf(braced)).toEqual([]);
    });

    test("inside a block, a value nested deeper than that runs to the end of its line, and is reported", () => {
      const text = `component card(t) with
  slot
end

function f(x)
  return x
end

layout a with
  column {
    button @click={ t = {a={b={c={d={e={f={g={h={}}}}}}}}} } "Go"; text "after"
  }
end

layout b with
  column {
    card(f(f(f(f(f(f(1))))))) { text "body" }
  }
end

layout c with
  column {
    button @click=f(f(f(f(f(f(f(1))))))) { text "body" }
  }
end

layout d with
  column {
    text #x=f(f(f(f(f(f(f(1))))))) { text "body" }
  }
end

layout e with
  column {
    text #x={ {a={b={c={d={e={f={g={h={i=1}}}}}}}}} } { text "body" }
  }
end
`;
      const errors = errorsOf(text);
      // Every overflowing line is reported on its own line, and what follows
      // the value is never read as more of the element.
      for (const line of [10, 16, 22, 28, 34]) {
        expect(errors.some((e) => e.line === line)).toBe(true);
      }
      for (const name of ["a", "b", "c", "d", "e"]) {
        const [column] = lowered(text, "layout", name).tree.children;
        expect(column.children).toHaveLength(1);
        expect(column.children[0].children).toEqual([]);
      }
    });

    test("an inline long comment ends at its `]]`", () => {
      const text = `layout hud with\n  row { text "a" --[[ comment ]] ; text "b" }\nend\n`;
      const row = lowered(text, "layout", "hud").tree.children[0];
      expect(row.children.map((c: any) => c.content[0].text)).toEqual(["a", "b"]);
      expect(row.children[0].classes).toEqual([]);
      expect(errorsOf(text)).toEqual([]);
    });
  });

  test("a second block after an element's block is invalid", () => {
    const text = `layout hud with\n  row { text "a" } { text "b" }\nend\n`;
    const row = lowered(text, "layout", "hud").tree.children[0];
    expect(row.children.map((c: any) => c.content[0].text)).toEqual(["a"]);
    expect(errorsOf(text).map((e) => [e.message, e.text])).toEqual([
      ["Invalid syntax", "{"],
    ]);
  });

  test("`foldout \"Level {n}\" { … }` binds `{n}`", () => {
    const { tree } = lowered(
      `layout hud with\n  foldout "Level {n}" { text "x" }\nend\n`,
      "layout",
      "hud",
    );
    const foldout = tree.children[0];
    expect(foldout.content).toEqual([
      { kind: "literal", text: "Level " },
      { kind: "binding", binding: expect.objectContaining({ source: "{n}" }) },
    ]);
    expect(foldout.children[0].tag).toBe("text");
  });

  test("`text \"a\" \"b\"` in a block is keyed `text`, as on an indented line", () => {
    // The indented form reads `name "content" …` as adjacency content, keyed
    // by the name alone whatever follows the first string.
    const braced = `layout hud with
  row { text "a" "b"; text "c" #x=1 "d"; label "e" @click=go }
end
`;
    const indented = `layout hud with
  row {
    text "a" "b"
    text "c" #x=1 "d"
    label "e" @click=go
  }
end
`;
    expect(everything(braced)).toEqual(everything(indented));
    expect(lowered(braced, "layout", "hud").struct.row).toEqual({ text: "c", label: "e" });
  });

  test("`name = value` lines inside a block keep their meaning", () => {
    const { tree, struct } = lowered(
      `layout hud with\n  row {\n    image = "black"\n    color = white\n  }\nend\n`,
      "layout",
      "hud",
    );
    expect(struct.row).toEqual({ image: "black", color: "white" });
    const row = tree.children[0];
    expect(row.children[0]).toMatchObject({
      tag: "image",
      content: [{ kind: "literal", text: "black" }],
    });
    expect(row.props.color).toEqual({ kind: "literal", value: "white" });
  });
});

describe("indentation inside a brace block", () => {
  const BODY = [
    "  column.panel #child-gap=8 {",
    "    text.title \"Inventory\"",
    "    for item in bag do",
    "      row.item {",
    "        image #src={item.icon}",
    "        text \"{item.name}\"",
    "      }",
    "    else",
    "      text.empty \"Empty\"",
    "    end",
    "    title { stroke; text }",
    "  }",
  ];
  const source = (lines: string[]) =>
    `layout hud with\n${lines.join("\n")}\nend\n`;
  const reference = lowered(source(BODY), "layout", "hud");
  const referenceDiagnostics = diagnosticsOf(source(BODY));

  test("the reference reports only that `bag` is not declared", () => {
    // So no line is an orphan, and no brace is out of place.
    expect(referenceDiagnostics.map((d) => d.message)).toEqual([
      "Cannot find variable named `bag`",
    ]);
    expect(reference.tree.children[0].children).toHaveLength(3);
  });

  for (const [label, indent] of [
    ["none", ""],
    ["one space", " "],
    ["a tab", "\t"],
    ["ten spaces", "          "],
  ] as const) {
    test(`re-indenting each line inside the block to ${label} changes nothing`, () => {
      for (let i = 1; i < BODY.length; i += 1) {
        const lines = [...BODY];
        lines[i] = indent + lines[i]!.trimStart();
        const text = source(lines);
        const result = lowered(text, "layout", "hud");
        expect(result.tree).toEqual(reference.tree);
        expect(result.struct).toEqual(reference.struct);
        expect(diagnosticsOf(text)).toEqual(referenceDiagnostics);
      }
    });
  }

  test("every line at no indentation at all changes nothing", () => {
    const lines = BODY.map((l, i) => (i === 0 ? l : l.trimStart()));
    const result = lowered(source(lines), "layout", "hud");
    expect(result).toEqual(reference);
    expect(diagnosticsOf(source(lines))).toEqual(referenceDiagnostics);
  });
});

describe("mismatched braces and `end`", () => {
  test("a missing `}` inside a branch is reported and the next declaration compiles", () => {
    const text = `layout hud with
  column {
    if busy then
      row {
        text "busy"
    else
      text "idle"
    end
  }
end

layout after with
  text "after"
end
`;
    const errors = errorsOf(text);
    expect(errors).toEqual([
      expect.objectContaining({
        line: 3,
        text: "{",
        message: expect.stringContaining("missing its closing `}`"),
      }),
    ]);
    const hud = lowered(text, "layout", "hud").tree;
    const ifNode = hud.children[0].children[0];
    expect(ifNode.branches[0].children[0].children[0].tag).toBe("text");
    expect(ifNode.else[0].content).toEqual([{ kind: "literal", text: "idle" }]);
    expect(lowered(text, "layout", "after").tree.children[0].tag).toBe("text");
  });

  test("a missing `end` inside a block is reported and the next declaration compiles", () => {
    const text = `layout hud with
  column {
    for item in bag do
      text "{item}"
  }
  text "after column"
end

layout after with
  text "after"
end
`;
    const errors = errorsOf(text);
    expect(errors).toEqual([
      expect.objectContaining({
        line: 2,
        message: expect.stringContaining("missing its closing `end`"),
      }),
    ]);
    const hud = lowered(text, "layout", "hud").tree;
    expect(hud.children.map((c: any) => c.tag)).toEqual(["column", "text"]);
    expect(hud.children[0].children[0].kind).toBe("for");
    expect(lowered(text, "layout", "after").tree.children[0].tag).toBe("text");
  });

  test("an unclosed `{` at the top of the body ends at the declaration's `end`", () => {
    const text = `layout hud with
  column {
    text "a"
end

layout after with
  text "after"
end
`;
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: 1, text: "{" }),
    ]);
    expect(lowered(text, "layout", "hud").tree.children[0].children[0].tag).toBe(
      "text",
    );
    expect(lowered(text, "layout", "after").tree.children[0].tag).toBe("text");
  });

  test("a stray `}`, an indented header, a `-` item and a block with no element are invalid", () => {
    // A block on a line of its own is the block of the element before it
    // (#1225); the invalid `row:` ends the `text` element, so the block after
    // it has none.
    const text = `layout hud with
  column {
    - text
    row:
    { text "x" }
  }
  }
end
`;
    expect(
      errorsOf(text)
        .map((e) => [e.message, e.line, e.text])
        .sort((a, b) => (a[1] as number) - (b[1] as number)),
    ).toEqual([
      ["Invalid syntax", 2, "-"],
      ["Invalid syntax", 3, ":"],
      ["Invalid syntax", 4, "{"],
      ["Invalid syntax", 6, "}"],
    ]);
  });
});
