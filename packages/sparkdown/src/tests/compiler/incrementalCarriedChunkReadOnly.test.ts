// The assembly never changes the `content` of a chunk carried from the
// previous compile (#674).
//
// A `choose … then … end` lowers to a chunk whose content ends in a nested
// weave, and the lines after the block are assembled into a weave that follows
// that one's children. The carried chunk's own objects must come out of every
// compile holding exactly the children they held before it, or the next
// compile starts from whatever this one assembled. The assembly does set the
// `parent` of those children, which this test does not check. The edits leave a line between themselves
// and the block, because the chunk just above an edit is lowered again.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";

const URI = "inmemory:///main.sd";

const SCRIPT = [
  "-> act_one",
  "",
  "scene act_one",
  "  Beat before.",
  "  choose",
  "  + [Press on]",
  "    You press on.",
  "    choose",
  "    + [Run]",
  "      You run.",
  "    + [Walk]",
  "      You walk.",
  "    end",
  "  + [Hold back]",
  "    You hold back.",
  "  then",
  "    The way opens.",
  "  end",
  "  Beat 1 after.",
  "  Beat 2 after.",
  "  Beat 3 after.",
  "end",
].join("\n");

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function compilerFor(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ],
  } as never);
  return c;
}

const compileOf = (c: SparkdownCompiler) =>
  quiet(() => c.compile({ textDocument: { uri: URI } })).program;

function chunks(c: SparkdownCompiler): any[] {
  const blocks: any[] = [];
  const cur = c.documents.annotations(URI).compilations.iter();
  while (cur.value) {
    blocks.push(cur.value.type);
    cur.next();
  }
  return blocks;
}

function contains(content: ParsedObject[] | undefined, type: Function): boolean {
  return (content ?? []).some(
    (o) => o instanceof type || contains(o.content, type),
  );
}

/**
 * Every object reachable through `content` in walk order, each written as its
 * type and the numbers of the objects it holds. An object met for the first
 * time is numbered by `ids`, so two walks agree only over the same objects.
 */
function graph(content: ParsedObject[], ids: Map<ParsedObject, number>) {
  const out: string[] = [];
  const seen = new Set<ParsedObject>();
  const id = (o: ParsedObject) => {
    if (!ids.has(o)) ids.set(o, ids.size);
    return ids.get(o)!;
  };
  const walk = (objs: ParsedObject[]) => {
    for (const o of objs) {
      if (seen.has(o)) continue;
      seen.add(o);
      const children = o.content ?? [];
      out.push(`${id(o)} ${o.typeName} [${children.map(id).join(",")}]`);
      walk(children);
    }
  };
  walk(content);
  return out;
}

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

describe("a carried choose chunk", () => {
  it("holds the same objects after a compile that assembles the lines below it", () => {
    const c = compilerFor(SCRIPT);
    compileOf(c);
    const choose = chunks(c).find((b) => contains(b.content, Choice));
    expect(choose, "the script has a choose chunk").toBeDefined();
    const ids = new Map<ParsedObject, number>();
    const before = graph(choose.content, ids);

    for (const [version, find, replace] of [
      [2, "Beat 2 after.", "Beat 2 after, changed."],
      [3, "Beat 3 after.", "Beat 3 after, changed.\n  Beat 4 after."],
    ] as const) {
      const text = c.documents.get(URI)!.getText();
      const offset = text.indexOf(find);
      c.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [
          {
            range: {
              start: posAt(text, offset),
              end: posAt(text, offset + find.length),
            },
            text: replace,
          },
        ],
      } as never);
      const program = compileOf(c);
      expect(JSON.stringify(program.compiled)).toContain(replace.split("\n")[0]);

      expect(
        chunks(c).includes(choose),
        "the choose chunk is carried, not re-lowered",
      ).toBe(true);
      expect(graph(choose.content, ids), `the objects after "${replace}"`).toEqual(
        before,
      );
    }
  });
});
