// Binary string-table reseeding (#314).
//
// The table is append-only so cached chunks' payload pointers stay valid, which
// means it grows: every edited flow interns strings for its changed lines, and
// those are dead immediately (measured ~1 per keystroke on raffles-and-bunny).
// The table SHIPS inside program.compiledBuffer, so unchecked growth costs
// payload and per-hop clone time, not just memory.
//
// Reseeding is therefore required — and it is the one operation that can
// silently corrupt output, because every cached chunk was minted against the
// old numbering. `generation` exists to refuse those chunks; these tests are
// what prove it actually does.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { materializeNode } from "../../binary/programBinary";
import {
  ProgramBinaryWriter,
  createProgramTable,
  reseedProgramTable,
} from "../../binary/ProgramBinaryWriter";

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

function makeCompiler(text: string, binaryProgram: boolean) {
  const c = new SparkdownCompiler();
  c.configure({
    binaryProgram,
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

function coldJson(text: string): string {
  return quiet(() => {
    const c = makeCompiler(text, false);
    return JSON.stringify(
      (c.compile({ textDocument: { uri: URI } } as never) as any).program
        .compiled,
    );
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

describe("binary string-table reseeding", () => {
  it("refuses chunks minted against an older table generation", () => {
    // Without this guard a stale chunk would be spliced verbatim and its
    // payload pointers would resolve against a table that no longer numbers
    // those strings the same way — silent corruption, not a crash.
    const table = createProgramTable();
    const source = new ProgramBinaryWriter(table);
    source.WriteArrayStart();
    const mark = source.mark();
    source.WriteArrayStart();
    source.Write("ev");
    source.Write("^some text");
    source.WriteArrayEnd();
    const chunk = source.captureChunk(mark);
    source.WriteArrayEnd();
    expect(chunk.generation).toBe(0);

    reseedProgramTable(table);
    expect(table.generation).toBe(1);

    // A stale chunk must FAIL LOUDLY. There is no correct recovery inside the
    // writer: whoever returned the chunk did so instead of calling
    // serialize(), so the real content is gone. Encoding it as a plain value
    // would write `{nodes, generation}` into the program as data — which is
    // exactly the silent corruption this test was written to catch.
    const fresh = new ProgramBinaryWriter(table);
    fresh.WriteArrayStart();
    expect(() => fresh.WriteInjected(chunk)).toThrow(/Stale program chunk/);

    // A non-chunk value still injects normally.
    const ok = new ProgramBinaryWriter(table);
    ok.WriteArrayStart();
    ok.WriteInjected({ rebuilt: true });
    ok.WriteArrayEnd();
    expect(materializeNode(ok.toBuffer())).toEqual([{ rebuilt: true }]);
  });

  it("still produces a correct program after the table is reseeded", () => {
    const text = corpus("a");
    const c = quiet(() => makeCompiler(text, true));
    quiet(() => c.compile({ textDocument: { uri: URI } } as never));

    // Force the condition the size policy would eventually reach, rather than
    // typing thousands of characters to trigger it naturally.
    reseedProgramTable((c as never as { _binaryTable: never })._binaryTable);
    (c as never as { _binaryTableBaseline: number })._binaryTableBaseline = 0;

    // Now edit and recompile: every cached chunk is stale, so the compile must
    // fall back to re-serializing and still match a cold JSON compile.
    const NL = String.fromCharCode(10);
    const anchor = "Action 2 a";
    const at = text.indexOf(anchor);
    expect(at).toBeGreaterThan(-1);
    const off = at + anchor.length;
    const before = text.slice(0, off);
    const line = before.split(NL).length - 1;
    const character = off - (before.lastIndexOf(NL) + 1);
    const updated = text.slice(0, off) + "!" + text.slice(off);

    quiet(() =>
      c.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [
          {
            range: { start: { line, character }, end: { line, character } },
            text: "!",
          },
        ],
      } as never),
    );
    const program = quiet(
      () => (c.compile({ textDocument: { uri: URI } } as never) as any).program,
    );
    expect(JSON.stringify(materializeNode(program.compiledBuffer))).toBe(
      coldJson(updated),
    );
  });

  it("keeps the table bounded instead of growing per keystroke", () => {
    // The leak this policy exists for: each edit interns strings for the line
    // it changed, and they are dead on the next keystroke.
    const text = corpus("a");
    const c = quiet(() => makeCompiler(text, true));
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
      () => (c.compile({ textDocument: { uri: URI } } as never) as any).program,
    );
    expect(JSON.stringify(materializeNode(program.compiledBuffer))).toBe(
      coldJson(current),
    );
  });
});
