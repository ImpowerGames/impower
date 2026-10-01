import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// #1225: a line that continues an element joins the element above it, so
// adding or removing one changes that element, and typing or deleting the
// `}` of a closure that spans lines changes which lines the closure holds.
// An incremental compile after each edit must give the program a cold
// compile of the same text gives.

const URI = "inmemory:///main.sd";

const SOURCE = `scene main
  Hello.
end

store score = 0

component card(title) with
  column.card {
    text
      .title
      "{title}"
    slot
  }
end

layout inventory with
  button
    .primary
    "Use"
  column.panel {
    text
      "Inventory"
    image
      #src=a.png
    button "Go" @click={
      score = score + 1
      score = score * 2
    }
    text "after"
  }
end

scene after
  Goodbye.
end
`;

function pick(p: any) {
  return {
    compiled: p.compiled,
    context: p.context,
    sparkle: p.sparkle,
    diagnostics: p.diagnostics,
    ui: p.ui,
    pathLocations: p.pathLocations,
    dataLocations: p.dataLocations,
  };
}

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

const file = (text: string, version: number) => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

function coldCompile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({ files: [file(text, 1)] } as any);
  return pick(c.compile({ textDocument: { uri: URI } }).program);
}

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

/** Each element of a layout tree as `tag.class…` with its children. */
function shape(nodes: any[]): string[] {
  return (nodes ?? []).map((n: any) =>
    n.kind === "element"
      ? `${[n.tag, ...n.classes].join(".")}[${shape(n.children).join(",")}]`
      : n.kind,
  );
}

const layoutShape = (program: ReturnType<typeof pick>) =>
  shape((program.sparkle as any)?.layouts?.["inventory"]?.children);
const componentShape = (program: ReturnType<typeof pick>) =>
  shape((program.sparkle as any)?.components?.["card"]?.children);

// Each edit inserts `text` right after `after` (the text before it), and how
// the edited source reads.
const INSERTS = [
  {
    name: "a class line after an indented element's last part",
    after: '    "Use"',
    text: "\n    .wide",
    reads: (p: ReturnType<typeof pick>) =>
      expect(layoutShape(p)[0]).toBe("button.primary.wide[]"),
  },
  {
    name: "a class line in a block",
    after: '      "Inventory"',
    text: "\n      .title",
    reads: (p: ReturnType<typeof pick>) =>
      expect(layoutShape(p)[1]).toMatch(/^column\.panel\[text\.title\[\],/),
  },
  {
    name: "a block on a line of its own",
    after: "      #src=a.png",
    text: "\n    {\n      stroke\n    }",
    reads: (p: ReturnType<typeof pick>) =>
      expect(layoutShape(p)[1]).toContain("image[stroke[]]"),
  },
  {
    name: "a class line in a component body",
    after: '      "{title}"',
    text: "\n      .big",
    reads: (p: ReturnType<typeof pick>) =>
      expect(componentShape(p)[0]).toMatch(/^column\.card\[text\.title\.big\[\],/),
  },
  {
    name: "a part line that continues nothing",
    after: "  column.panel {",
    text: '\n    "stray"',
    reads: (p: ReturnType<typeof pick>) =>
      expect(
        ((p.diagnostics as any)?.[URI] ?? []).some((d: any) =>
          (typeof d.message === "string" ? d.message : d.message.value).startsWith(
            "There is no element for this line to continue",
          ),
        ),
      ).toBe(true),
  },
];

describe("adding and removing a line that continues an element", () => {
  it.each(INSERTS)("$name", ({ after, text, reads }) => {
    const c = new SparkdownCompiler();
    c.configure({ files: [file(SOURCE, 1)] } as any);
    c.compile({ textDocument: { uri: URI } });

    const offset = SOURCE.indexOf(after) + after.length;
    expect(SOURCE.indexOf(after)).toBeGreaterThanOrEqual(0);
    const edited = SOURCE.slice(0, offset) + text + SOURCE.slice(offset);
    const at = posAt(SOURCE, offset);

    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text }],
    });
    const afterAdding = pick(c.compile({ textDocument: { uri: URI } }).program);
    const coldAdded = coldCompile(edited);
    expect(stable(afterAdding)).toBe(stable(coldAdded));
    reads(coldAdded);

    const end = posAt(edited, offset + text.length);
    c.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ range: { start: at, end }, text: "" }],
    });
    const afterRemoving = pick(c.compile({ textDocument: { uri: URI } }).program);
    expect(stable(afterRemoving)).toBe(stable(coldCompile(SOURCE)));
  });
});

describe("deleting and retyping the `}` of a closure that spans lines", () => {
  it("lets the block's `}` close the closure, then closes it again", () => {
    const c = new SparkdownCompiler();
    c.configure({ files: [file(SOURCE, 1)] } as any);
    const cold = c.compile({ textDocument: { uri: URI } }).program;
    expect(((cold.diagnostics as any)?.[URI] ?? []).filter((d: any) => d.severity === 1)).toEqual([]);

    const before = "score = score * 2\n    ";
    const offset = SOURCE.indexOf(before) + before.length;
    expect(SOURCE[offset]).toBe("}");
    const deleted = SOURCE.slice(0, offset) + SOURCE.slice(offset + 1);
    const start = posAt(SOURCE, offset);
    const end = { line: start.line, character: start.character + 1 };

    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start, end }, text: "" }],
    });
    const afterDeleting = pick(c.compile({ textDocument: { uri: URI } }).program);
    const coldDeleted = coldCompile(deleted);
    expect(stable(afterDeleting)).toBe(stable(coldDeleted));
    // The closure now ends at the `}` that closed the panel, so it is the
    // panel's block that is left open, reported on its `{`.
    const open = SOURCE.indexOf("column.panel {") + "column.panel ".length;
    expect(
      ((coldDeleted.diagnostics as any)?.[URI] ?? [])
        .filter((d: any) =>
          (typeof d.message === "string" ? d.message : d.message.value).includes(
            "is missing its closing `}`",
          ),
        )
        .map((d: any) => d.range.start),
    ).toEqual([posAt(SOURCE, open)]);

    c.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ range: { start, end: start }, text: "}" }],
    });
    const afterRetyping = pick(c.compile({ textDocument: { uri: URI } }).program);
    expect(stable(afterRetyping)).toBe(stable(coldCompile(SOURCE)));
  });
});
