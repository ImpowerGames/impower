// String-table reseeding (#314, kept for the statement chunks).
//
// The table every program a compiler builds reads (`ProgramTable`) is
// append-only, so the chunks a compile keeps still read the ids they were
// built with, which means it grows: every edited statement interns strings
// for its changed lines, and those are dead immediately (measured ~1 per
// keystroke on raffles-and-bunny). The compiler bounds it by reseeding it
// (`maybeReseedBinaryTable`), which the chunk store's roots cross
// (`ChunkStore.reseed`).
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programContent } from "../programListing";

const URI = "inmemory:///main.sd";

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

function makeCompiler(text: string) {
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
  } as never);
  return c;
}

function coldContent(text: string): string[] {
  return quiet(() => {
    const c = makeCompiler(text);
    return programContent(c.compile({ textDocument: { uri: URI } }).program.chunks);
  });
}

function corpus(tag: string): string {
  const L: string[] = [];
  L.push("title: Reseed");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < 4; s++) {
    L.push(`scene scene_${s}`);
    L.push(":");
    L.push(`  Action ${s} ${tag} with {trust}.`);
    L.push(`-> scene_${(s + 1) % 4}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

describe("string-table reseeding", () => {
  it("keeps the table bounded instead of growing per keystroke", () => {
    // The leak this policy exists for: each edit interns strings for the line
    // it changed, and they are dead on the next keystroke.
    const text = corpus("a");
    const c = quiet(() => makeCompiler(text));
    quiet(() => c.compile({ textDocument: { uri: URI } } as never));
    const table = (c as never as { _binaryTable: { strings: string[] } })
      ._binaryTable;
    const baseline = table.strings.length;

    const NL = String.fromCharCode(10);
    let current = text;
    const EDITS = 900; // enough to exceed the minimum slack and trip the ratio
    for (let i = 0; i < EDITS; i += 1) {
      const anchor = "Action 2 a";
      const at = current.indexOf(anchor);
      const off = at + anchor.length;
      const before = current.slice(0, off);
      const line = before.split(NL).length - 1;
      const character = off - (before.lastIndexOf(NL) + 1);
      current = current.slice(0, off) + "z" + current.slice(off);
      quiet(() =>
        c.updateDocument({
          textDocument: { uri: URI, version: i + 2 },
          contentChanges: [
            {
              range: { start: { line, character }, end: { line, character } },
              text: "z",
            },
          ],
        } as never),
      );
      quiet(() => c.compile({ textDocument: { uri: URI } } as never));
    }

    // Unbounded growth would be baseline + EDITS. The policy must hold it well
    // under that; the exact figure depends on where the ratio last tripped.
    expect(table.strings.length).toBeLessThan(baseline + EDITS);
    expect(table.strings.length).toBeLessThan(baseline * 2 + 600);

    // And the program is still correct after however many reseeds happened.
    const program = quiet(
      () => c.compile({ textDocument: { uri: URI } } as never).program,
    );
    expect(programContent(program.chunks)).toEqual(coldContent(current));
  });
});
