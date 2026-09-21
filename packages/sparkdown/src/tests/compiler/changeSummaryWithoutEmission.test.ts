// A compile that emits no bytecode still answers whether its changes are
// confined, when something can read the answer (#713).
//
// The answer is read only to resume a route, and a route needs a start
// position. The player's worker compiles with one; the language servers compile
// with emission off and no start position on every keystroke and read no
// summary, so they are not charged for the walk that gathers the evidence.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { JsonSerialisation } from "../../inkjs/engine/JsonSerialisation";

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

// Long enough that the chunk an edit to a late beat re-reads holds no
// declaration: a changed chunk that declares a global is a hazard of its own.
const SOURCE = [
  "store trust = 0",
  "",
  "-> act_one",
  "",
  "scene act_one",
  ...Array.from({ length: 16 }, (_, i) => `  Beat ${i} of the first act.`),
  "end",
  "",
].join("\n");

const TARGET = SOURCE.split("\n").indexOf("  Beat 12 of the first act.");

/** A compiler configured the way a host with emission off configures it, and
 *  a way to type into its one document. */
function host(emitCompiledProgram = false) {
  const compiler = new SparkdownCompiler();
  let text = SOURCE;
  let version = 1;
  quiet(() =>
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      emitCompiledProgram,
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text,
          version,
          languageId: "sparkdown",
        },
      ],
    } as never),
  );
  const posAt = (offset: number) => {
    const before = text.slice(0, offset).split("\n");
    return { line: before.length - 1, character: before.at(-1)!.length };
  };
  return {
    /** Compile, with a start position only when a line is given. */
    compile(line?: number) {
      return quiet(
        () =>
          (
            compiler.compile({
              textDocument: { uri: URI },
              ...(line == null ? {} : { startFrom: { file: URI, line } }),
            } as never) as any
          ).program,
      );
    },
    edit(find: string, replace: string) {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
      const range = { start: posAt(offset), end: posAt(offset + find.length) };
      version += 1;
      quiet(() =>
        compiler.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [{ range, text: replace }],
        } as never),
      );
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
    },
  };
}

/** Count the two walks that gather the evidence: the cross-flow fingerprint
 *  and the counting signature, each once per flow. */
function watchWalks() {
  const proto = SparkdownCompiler.prototype as unknown as Record<string, any>;
  return {
    fingerprints: vi.spyOn(JsonSerialisation, "FingerprintCrossFlow"),
    counting: vi.spyOn(proto, "countingSignature"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// The fixture's edit is one an emitting compile certifies, so a verdict of
// false below is the missing evidence and not the edit.
it("control: an emitting compile certifies the same edit", () => {
  const emitting = host(true);
  emitting.compile(TARGET);
  emitting.edit("Beat 12 of the first act.", "Beat 12 of the first act, typed.");
  expect(emitting.compile(TARGET).changes?.confined).toBe(true);
});

describe("a compile that emits no bytecode", () => {
  it("walks nothing and certifies nothing without a start position", () => {
    const lsp = host();
    lsp.compile();
    lsp.edit("Beat 12 of the first act.", "Beat 3 of the first act, typed.");
    const walks = watchWalks();

    const program = lsp.compile();

    expect(walks.fingerprints).not.toHaveBeenCalled();
    expect(walks.counting).not.toHaveBeenCalled();
    expect(program.compiled).toBeUndefined();
    expect(program.changes?.confined).toBe(false);
  });

  it("certifies an edit inside one beat when it has a start position", () => {
    const player = host();
    player.compile(TARGET);
    player.edit("Beat 12 of the first act.", "Beat 3 of the first act, typed.");
    const walks = watchWalks();

    const program = player.compile(TARGET);

    expect(walks.fingerprints).toHaveBeenCalled();
    expect(walks.counting).toHaveBeenCalled();
    expect(program.compiled).toBeUndefined();
    expect(program.changes?.confined).toBe(true);
  });

  // The second compile changes nothing and is served from the last one, which
  // gathered no shapes. It has a start position, so the program it serves is
  // the baseline the edit after it is measured against.
  it("takes a baseline from an unchanged compile that gains a start position", () => {
    const session = host();
    session.compile();
    session.compile(TARGET);
    session.edit("Beat 12 of the first act.", "Beat 12 of the first act, typed.");

    expect(session.compile(TARGET).changes?.confined).toBe(true);
  });

  // The compile in the middle gathers nothing, so the evidence on hand after it
  // is the first compile's. Comparing the third compile with that would find
  // the scene counting nothing in both, and certify a program whose scene
  // stopped counting its visits since the program just before it.
  it("leaves the next compile no baseline rather than an older one", () => {
    const READ = " It has run {act_one} times.";
    const session = host();
    session.compile(TARGET);
    session.edit("Beat 12 of the first act.", `Beat 12 of the first act.${READ}`);
    session.compile();
    session.edit(READ, "");

    const afterGap = session.compile(TARGET);
    session.edit("Beat 12 of the first act.", "Beat 3 of the first act, typed.");
    const next = session.compile(TARGET);

    expect(afterGap.changes?.confined).toBe(false);
    // One compile of new evidence is all it takes to certify again.
    expect(next.changes?.confined).toBe(true);
  });
});
