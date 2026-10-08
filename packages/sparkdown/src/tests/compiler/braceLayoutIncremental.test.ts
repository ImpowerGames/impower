import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programContent } from "../programListing";

// #1224: typing a `}` inside a layout or component brace body, and deleting it
// again, changes which lines the blocks around it hold. An incremental compile
// after each keystroke must give the program a cold compile of the same text
// gives.

const URI = "inmemory:///main.sd";

const SOURCE = `scene main
  Hello.
end

component card(title) with
  column.card {
    text.title "{title}"
    slot
  }
end

layout inventory with
  column.panel #child-gap=8 {
    text.title "Inventory"
    choice.0 { text }
    for item in bag do
      row.item {
        image #src={item.icon}
        button "Use" @click=use_item(item)
      }
    else
      text.empty "Your bag is empty."
    end
    title { stroke; text }
    card("Inventory") { text "body" }
  }
end

scene after
  Goodbye.
end
`;

function pick(p: any) {
  return {
    chunks: programContent(p.chunks),
    context: p.context,
    sparkle: p.sparkle,
    diagnostics: p.diagnostics,
    ui: p.ui,
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

// Where the extra `}` goes, and the `}` that is then stray (zero-based line
// and character): the typed one when it closes nothing (`null`), otherwise
// the `}` that used to close the outermost block, which the `}` before it now
// closes. Typed inside the `for` branch, the `}` after it closes the `for`
// (reported as missing its `end`), and the `end` of the `for` then ends the
// layout, so no `}` is left inside the layout to be stray.
const EDITS = [
  { name: "after a one-line block", after: "choice.0 { text }", stray: [{ line: 25, character: 2 }], missing: [] },
  {
    name: "inside a block in a `for` branch",
    after: "        image #src={item.icon}",
    stray: [],
    missing: [15],
    // The row closes after its image, the button joins the `for`, and the
    // row's own `}` ends the `for` and then closes the panel.
    tree: ["column[text[],choice[text[]],for[row[image[]],button[]|else:]]"],
  },
  { name: "after a block with two entries", after: "title { stroke; text }", stray: [{ line: 25, character: 2 }], missing: [] },
  { name: "inside a component body", after: "    slot", stray: [{ line: 8, character: 2 }], missing: [] },
  { name: "after the outermost block", after: "\n  }\nend\n\nscene after", stray: null, missing: [] },
] as {
  name: string;
  after: string;
  stray: { line: number; character: number }[] | null;
  missing: number[];
  tree?: string[];
}[];

/** The lines of a compiled program's missing-`}` and missing-`end` errors. */
function missingClosers(program: ReturnType<typeof pick>) {
  return ((program.diagnostics as any)?.[URI] ?? [])
    .filter((d: any) =>
      (typeof d.message === "string" ? d.message : d.message.value).includes("is missing its closing"),
    )
    .map((d: any) => d.range.start.line);
}

/** The shape of a layout tree: each element's tag and children, and each
 *  `for`'s children and `else` children. */
function shape(nodes: any[]): string[] {
  return (nodes ?? []).map((n: any) =>
    n.kind === "element"
      ? `${n.tag}[${shape(n.children).join(",")}]`
      : n.kind === "for"
        ? `for[${shape(n.children).join(",")}|else:${shape(n.else).join(",")}]`
        : n.kind,
  );
}

/** The `Invalid syntax` errors of a compiled program, by start position. */
function invalidSyntax(program: ReturnType<typeof pick>) {
  return ((program.diagnostics as any)?.[URI] ?? [])
    .filter((d: any) => (typeof d.message === "string" ? d.message : d.message.value) === "Invalid syntax")
    .map((d: any) => ({ line: d.range.start.line, character: d.range.start.character }));
}

describe("typing and deleting a `}` in a layout or component brace body", () => {
  it.each(EDITS)("$name", ({ after, stray, missing, tree }) => {
    const c = new SparkdownCompiler();
    c.configure({ files: [file(SOURCE, 1)] } as any);
    c.compile({ textDocument: { uri: URI } });

    // The last case types the `}` right after the outermost block's `}`.
    const offset =
      stray === null
        ? SOURCE.indexOf(after) + "\n  }".length
        : SOURCE.indexOf(after) + after.length;
    expect(SOURCE.indexOf(after)).toBeGreaterThanOrEqual(0);
    const typed = SOURCE.slice(0, offset) + "}" + SOURCE.slice(offset);

    // Type the `}`.
    const at = posAt(SOURCE, offset);
    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: "}" }],
    });
    const afterTyping = pick(c.compile({ textDocument: { uri: URI } }).program);
    const coldTyped = coldCompile(typed);
    expect(stable(afterTyping)).toBe(stable(coldTyped));
    // The stray `}` is reported where it stands, and nowhere else.
    expect(invalidSyntax(coldTyped)).toEqual(stray ?? [at]);
    expect(invalidSyntax(coldCompile(SOURCE))).toEqual([]);
    // A block or control block the `}` leaves open is reported where it opens.
    expect(missingClosers(coldTyped)).toEqual(missing);
    expect(missingClosers(coldCompile(SOURCE))).toEqual([]);
    if (tree) {
      expect(shape((coldTyped.sparkle as any)?.layouts?.["inventory"]?.children)).toEqual(tree);
    }

    // Delete it again.
    const end = { line: at.line, character: at.character + 1 };
    c.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ range: { start: at, end }, text: "" }],
    });
    const afterDeleting = pick(c.compile({ textDocument: { uri: URI } }).program);
    expect(stable(afterDeleting)).toBe(stable(coldCompile(SOURCE)));
  });
});

// Each `}` that closes a block in the layout and component bodies, and the
// `end` of the `for` inside one, found by the text before it. Deleting one
// leaves its block, or the `for`, open, which is reported where it opens,
// before the edit.
const CLOSERS = [
  { name: "the component's block", before: "    slot\n  ", text: "}" },
  { name: "a one-line block", before: "choice.0 { text ", text: "}" },
  { name: "a block in a `for` branch", before: "use_item(item)\n      ", text: "}" },
  { name: "the `for`", before: "Your bag is empty.\"\n    ", text: "end" },
  { name: "a block with two entries", before: "title { stroke; text ", text: "}" },
  { name: "a component call's block", before: "{ text \"body\" ", text: "}" },
  { name: "the outermost block", before: "{ text \"body\" }\n  ", text: "}" },
].map((closer) => {
  const offset = SOURCE.indexOf(closer.before) + closer.before.length;
  return { ...closer, offset };
});

describe("deleting and retyping a block's closer in a layout or component body", () => {
  it("finds every closer", () => {
    for (const { offset, text } of CLOSERS) {
      expect(SOURCE.slice(offset, offset + text.length)).toBe(text);
    }
  });

  it.each(CLOSERS)("$name", ({ offset, text }) => {
    const c = new SparkdownCompiler();
    c.configure({ files: [file(SOURCE, 1)] } as any);
    c.compile({ textDocument: { uri: URI } });

    const start = posAt(SOURCE, offset);
    const end = { line: start.line, character: start.character + text.length };
    const deleted = SOURCE.slice(0, offset) + SOURCE.slice(offset + text.length);
    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start, end }, text: "" }],
    });
    const afterDeleting = pick(c.compile({ textDocument: { uri: URI } }).program);
    const coldDeleted = coldCompile(deleted);
    expect(stable(afterDeleting)).toBe(stable(coldDeleted));
    // The open block or control block is reported.
    expect(((coldDeleted.diagnostics as any)?.[URI] ?? []).some((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return message.includes("is missing its closing");
    })).toBe(true);

    c.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ range: { start, end: start }, text }],
    });
    const afterRetyping = pick(c.compile({ textDocument: { uri: URI } }).program);
    expect(stable(afterRetyping)).toBe(stable(coldCompile(SOURCE)));
  });
});
