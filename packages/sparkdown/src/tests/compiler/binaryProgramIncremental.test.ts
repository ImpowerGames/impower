// Compiler-level binary path equivalence, INCLUDING across edits (#314 phase 2).
//
// Phase 2's whole risk is the per-flow chunk cache: a chunk carried across a
// compile could decode against the wrong string table, be rebased wrongly, or
// be served for a flow that actually changed. So the gate is not "the binary
// path works once" — it is that after a SEQUENCE of edits the binary program
// still equals what a cold JSON compile of the same text produces.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { materializeNode } from "../../binary/programBinary";

const URI = "inmemory:///main.sd";

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

/** Compile once from scratch, JSON path. */
function coldJson(text: string): string {
  return quiet(() => {
    const c = makeCompiler(text, false);
    const program = (c.compile({ textDocument: { uri: URI } } as never) as any)
      .program;
    return JSON.stringify(program.compiled);
  });
}

function corpus(sceneCount: number, tag: string): string {
  const L: string[] = [];
  L.push("title: Incremental Binary");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push("");
  L.push("const LIMIT = 3");
  L.push("store trust = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  for (let s = 0; s < sceneCount; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action ${s} ${tag} with {trust} and {LIMIT}.`);
    L.push("hero:");
    L.push(`  Line ${s} for ${tag}.`);
    L.push("& trust = bonus(trust)");
    L.push(`-> scene_${(s + 1) % sceneCount}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

describe("binary program path (#314 phase 2)", () => {
  it("populates compiledBuffer instead of compiled", () => {
    const program = quiet(() => {
      const c = makeCompiler(corpus(4, "a"), true);
      return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
    });
    expect(program.compiledBuffer).toBeTruthy();
    expect(ArrayBuffer.isView(program.compiledBuffer.nodes)).toBe(true);
    expect(Array.isArray(program.compiledBuffer.strings)).toBe(true);
    expect(program.compiled).toBeUndefined();
  });

  it("cold binary compile equals cold JSON compile", () => {
    const text = corpus(4, "a");
    const program = quiet(() => {
      const c = makeCompiler(text, true);
      return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
    });
    expect(JSON.stringify(materializeNode(program.compiledBuffer))).toBe(
      coldJson(text),
    );
  });

  it("stays identical to a cold compile across a sequence of edits", () => {
    // The chunk cache only engages on the SECOND and later compiles, so a
    // single-compile test would not exercise splice at all.
    const text = corpus(5, "a");
    const c = quiet(() => makeCompiler(text, true));
    quiet(() => c.compile({ textDocument: { uri: URI } } as never));

    // Edit inside one scene body, repeatedly. Every other flow should be
    // served from its cached chunk while this one is re-serialized.
    const NL = String.fromCharCode(10);
    let current = text;
    for (let i = 0; i < 4; i += 1) {
      // Anchor on text the edit does NOT consume, so it still resolves after
      // each insertion (appending right after it leaves it intact).
      const anchor = "Line 2 for a";
      const at = current.indexOf(anchor);
      expect(at, "edit anchor must exist").toBeGreaterThan(-1);
      const off = at + anchor.length;
      const before = current.slice(0, off);
      const line = before.split(NL).length - 1;
      const character = off - (before.lastIndexOf(NL) + 1);
      current = current.slice(0, off) + "!" + current.slice(off);

      quiet(() =>
        c.updateDocument({
          textDocument: { uri: URI, version: i + 2 },
          contentChanges: [
            {
              range: {
                start: { line, character },
                end: { line, character },
              },
              text: "!",
            },
          ],
        } as never),
      );
      const program = quiet(
        () => (c.compile({ textDocument: { uri: URI } } as never) as any).program,
      );
      expect(
        JSON.stringify(materializeNode(program.compiledBuffer)),
        `after edit ${i + 1}`,
      ).toBe(coldJson(current));
    }
  });

  it("stays identical when an edit adds a whole new flow", () => {
    // Adding a flow shifts every later flow's position and can rebind
    // positional synthetic names — the case the JSON memo excludes by name.
    const text = corpus(3, "a");
    const c = quiet(() => makeCompiler(text, true));
    quiet(() => c.compile({ textDocument: { uri: URI } } as never));

    const addition = ["", "scene extra_scene", ":", "  Brand new content.", "end", ""].join(
      String.fromCharCode(10),
    );
    const NL = String.fromCharCode(10);
    const lineCount = text.split(NL).length;
    const updated = text + addition;
    quiet(() =>
      c.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [
          {
            range: {
              start: { line: lineCount - 1, character: 0 },
              end: { line: lineCount - 1, character: 0 },
            },
            text: addition,
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
});
