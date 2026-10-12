// Story lines after a function declaration join the flow declared before the
// function, so a scene's chunk run can have function declarations inside it.
// A function closed by its `end` takes nothing from the chunks after it.
// Each edit below is applied to one persistent compiler and compared with a
// cold compile of the same text, and the edits that move a story line check
// which flow the line lands in.
//
// The scenes under test sit above a run of filler scenes: an edit re-lowers
// the chunks near it, and the incremental compile carries the others.
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { flowListings, pushesString } from "../programListing";
import { describeRoot } from "../program/describeRoot";

const URI = "inmemory:///main.sd";

const LESS = `function less(a, b)\n  return a < b\nend\n`;

const FILLER = [1, 2, 3, 4, 5]
  .map((n) => `scene filler_${n}\nF${n}\n-> DONE\nend\n\n`)
  .join("");

function pick(p: any) {
  return {
    chunks: p.chunks ? describeRoot(p.chunks) : null,
    functionLocations: p.functionLocations,
    sceneLocations: p.sceneLocations,
    diagnostics: p.diagnostics,
  };
}

function stable(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

function configured(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
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
  });
  return c;
}

function coldCompile(text: string) {
  return pick(configured(text).compile({ textDocument: { uri: URI } }).program);
}

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

interface Edit {
  name: string;
  /** The text to replace: its first occurrence at or after `after`. */
  find: string;
  replace: string;
  after?: string;
  /** Lines that must land in a named flow: the top level is `root`. */
  places?: { text: string; in: string }[];
}

/** The names of the flows whose instructions write the line `text`, with
 *  the top level's as `root`. */
function flowsHolding(program: any, text: string): string[] {
  expect(program.chunks, "the compile built statement chunks").toBeDefined();
  return [...flowListings(program.chunks)]
    .filter(([, listing]) => pushesString(listing, text))
    .map(([name]) => name || "root");
}

/** Applies each edit in turn to one compiler, comparing it with a cold
 *  compile after every edit. */
function expectIncrementalMatchesCold(base: string, edits: Edit[]) {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    let text = base;
    const incr = configured(text);
    incr.compile({ textDocument: { uri: URI } });
    let version = 1;
    for (const edit of edits) {
      const from = edit.after ? text.indexOf(edit.after) : 0;
      const offset = text.indexOf(edit.find, from);
      expect(from, `"${edit.after}" present`).toBeGreaterThanOrEqual(0);
      expect(offset, `"${edit.find}" present`).toBeGreaterThanOrEqual(0);
      const start = posAt(text, offset);
      const end = posAt(text, offset + edit.find.length);
      version += 1;
      incr.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [{ range: { start, end }, text: edit.replace }],
      });
      text =
        text.slice(0, offset) +
        edit.replace +
        text.slice(offset + edit.find.length);
      const program = incr.compile({ textDocument: { uri: URI } }).program;
      for (const place of edit.places ?? []) {
        expect(
          flowsHolding(program, place.text),
          `${place.text} after edit "${edit.name}"`,
        ).toEqual([place.in]);
      }
      expect(stable(pick(program)), `after edit "${edit.name}"`).toBe(
        stable(coldCompile(text)),
      );
    }
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

const editLast = (find: string, replace: string): Edit => ({
  name: `edit the last scene (${replace})`,
  find,
  replace,
  after: "scene last",
});

describe("incremental compile with story lines after a function declaration", () => {
  it("a line added after a function that ends a scene joins the scene", () => {
    const base = `-> one\n\nscene one\nA\n${LESS}\n${FILLER}scene last\nL\n-> DONE\nend\n`;
    expectIncrementalMatchesCold(base, [
      editLast("L\n", "L1\n"),
      editLast("L1\n", "L2\n"),
      {
        name: "add a line after the function",
        find: "end\n\n",
        replace: "end\nA2\n\n",
        after: "return",
        places: [{ text: "A2", in: "one" }],
      },
      editLast("L2\n", "L3\n"),
      {
        name: "edit the line after the function",
        find: "A2\n",
        replace: "A3\n",
        places: [{ text: "A3", in: "one" }],
      },
      editLast("L3\n", "L4\n"),
      { name: "remove the line after the function", find: "A3\n", replace: "" },
      editLast("L4\n", "L5\n"),
    ]);
  });

  it("a function added inside a scene leaves the lines after it in the scene", () => {
    const base = `-> one\n\nscene one\nA\nC\n-> DONE\nend\n\n${FILLER}scene last\nL\n-> DONE\nend\n`;
    expectIncrementalMatchesCold(base, [
      editLast("L\n", "L1\n"),
      {
        name: "add a function between two lines",
        find: "A\nC\n",
        replace: `A\n${LESS}C\n`,
        places: [{ text: "C", in: "one" }],
      },
      editLast("L1\n", "L2\n"),
      {
        name: "edit the line after the function",
        find: "C\n",
        replace: "Cee\n",
        after: "return",
        places: [{ text: "Cee", in: "one" }],
      },
      editLast("L2\n", "L3\n"),
      { name: "remove the function", find: LESS, replace: "" },
      editLast("L3\n", "L4\n"),
    ]);
  });

  it("lines after a function declared first stay in the root flow across edits", () => {
    const base = `${LESS}\nA\nB\n\n${FILLER}scene last\nL\n-> DONE\nend\n`;
    expectIncrementalMatchesCold(base, [
      editLast("L\n", "L1\n"),
      {
        name: "edit a root line",
        find: "A\n",
        replace: "Aye\n",
        after: "return",
        places: [
          { text: "Aye", in: "root" },
          { text: "B", in: "root" },
        ],
      },
      { name: "edit the function body", find: "a < b", replace: "a <= b" },
      editLast("L1\n", "L2\n"),
      {
        name: "add a second function",
        find: "Aye\n",
        replace: `function more(a, b)\n  return a > b\nend\nAye\n`,
        places: [{ text: "Aye", in: "root" }],
      },
      {
        name: "add a root line after the second function",
        find: "Aye\n",
        replace: "Aye\nZ\n",
        places: [{ text: "Z", in: "root" }],
      },
      editLast("L2\n", "L3\n"),
    ]);
  });
});
