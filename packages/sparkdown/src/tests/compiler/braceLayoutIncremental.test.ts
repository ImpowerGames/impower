import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programContent } from "../programListing";

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

const EDITS = [
  { name: "after a one-line block", after: "choice.0 { text }", stray: [{ line: 25, character: 2 }], missing: [] },
  {
    name: "inside a block in a `for` branch",
    after: "        image #src={item.icon}",
    stray: [],
    missing: [15, 11],
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

function missingClosers(program: ReturnType<typeof pick>) {
  return ((program.diagnostics as any)?.[URI] ?? [])
    .filter((d: any) =>
      (typeof d.message === "string" ? d.message : d.message.value).includes("is missing its closing"),
    )
    .map((d: any) => d.range.start.line);
}

function shape(nodes: any[]): string[] {
  return (nodes ?? []).map((n: any) =>
    n.kind === "element"
      ? `${n.tag}[${shape(n.children).join(",")}]`
      : n.kind === "for"
        ? `for[${shape(n.children).join(",")}|else:${shape(n.else).join(",")}]`
        : n.kind,
  );
}

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

    const offset =
      stray === null
        ? SOURCE.indexOf(after) + "\n  }".length
        : SOURCE.indexOf(after) + after.length;
    expect(SOURCE.indexOf(after)).toBeGreaterThanOrEqual(0);
    const typed = SOURCE.slice(0, offset) + "}" + SOURCE.slice(offset);

    const at = posAt(SOURCE, offset);
    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: "}" }],
    });
    const afterTyping = pick(c.compile({ textDocument: { uri: URI } }).program);
    const coldTyped = coldCompile(typed);
    expect(stable(afterTyping)).toBe(stable(coldTyped));
    expect(invalidSyntax(coldTyped)).toEqual(stray ?? [at]);
    expect(invalidSyntax(coldCompile(SOURCE))).toEqual([]);
    expect(missingClosers(coldTyped)).toEqual(missing);
    expect(missingClosers(coldCompile(SOURCE))).toEqual([]);
    if (tree) {
      expect(shape((coldTyped.sparkle as any)?.layouts?.["inventory"]?.children)).toEqual(tree);
    }

    const end = { line: at.line, character: at.character + 1 };
    c.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ range: { start: at, end }, text: "" }],
    });
    const afterDeleting = pick(c.compile({ textDocument: { uri: URI } }).program);
    expect(stable(afterDeleting)).toBe(stable(coldCompile(SOURCE)));
  });
});

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
