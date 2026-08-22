// Per-request bytecode, materialized lazily from the retained story (#351).
//
// The risk this pins down: `compile()` has a no-change short-circuit that
// returns the previous program. If that program was built with emission
// suppressed and a later request asks for bytecode, returning the cache hands
// back `undefined` — which downstream renders as an empty view rather than an
// error. So the interesting cases are all "ask AFTER the short-circuit is
// live", not "ask on a fresh compile".
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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

const SOURCE = [
  "title: On Demand",
  "",
  "define hero as character:",
  `  name = "Hero"`,
  "",
  "const LIMIT = 3",
  "store trust = 0",
  "",
  "scene one",
  ":",
  "  First beat with {trust} and {LIMIT}.",
  "hero:",
  "  A line of dialogue.",
  "-> two",
  "end",
  "",
  "scene two",
  ":",
  "  Second beat.",
  "end",
  "",
].join("\n");

function makeCompiler(text: string, emitCompiledProgram?: boolean) {
  const c = new SparkdownCompiler();
  c.configure({
    ...(emitCompiledProgram === undefined ? {} : { emitCompiledProgram }),
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

const compileWith = (c: SparkdownCompiler, emit?: boolean) =>
  quiet(
    () =>
      (
        c.compile({
          textDocument: { uri: URI },
          ...(emit === undefined ? {} : { emitCompiledProgram: emit }),
        } as never) as any
      ).program,
  );

/** Type an extra character into the dialogue line. */
function edit(c: SparkdownCompiler, text: string, version: number) {
  const NL = String.fromCharCode(10);
  const anchor = "A line of dialogue";
  const at = text.indexOf(anchor);
  const off = at + anchor.length;
  const before = text.slice(0, off);
  const line = before.split(NL).length - 1;
  const character = off - (before.lastIndexOf(NL) + 1);
  quiet(() =>
    c.updateDocument({
      textDocument: { uri: URI, version },
      contentChanges: [
        {
          range: { start: { line, character }, end: { line, character } },
          text: "!",
        },
      ],
    } as never),
  );
  return text.slice(0, off) + "!" + text.slice(off);
}

/** What a compiler that always emits produces for the same text. */
function coldCompiled(text: string): string {
  const c = makeCompiler(text, true);
  return JSON.stringify(compileWith(c).compiled);
}

describe("on-demand compiled program (#351)", () => {
  it("honours a per-request opt-in when the instance default is off", () => {
    const c = makeCompiler(SOURCE, false);
    expect(compileWith(c).compiled).toBeUndefined();
    expect(compileWith(c, true).compiled).toBeTruthy();
  });

  it("honours a per-request opt-OUT when the instance default is on", () => {
    const c = makeCompiler(SOURCE, true);
    expect(compileWith(c).compiled).toBeTruthy();
    // A fresh compiler, so the request is the only thing suppressing it.
    const c2 = makeCompiler(SOURCE, true);
    expect(compileWith(c2, false).compiled).toBeUndefined();
  });

  it("materializes bytecode from the retained story on the SHORT-CIRCUIT path", () => {
    // The bug this exists for. The second compile is a no-change hit, so the
    // cached program (built without bytecode) is what gets served — unless the
    // lazy path fires.
    const c = makeCompiler(SOURCE, false);
    expect(compileWith(c).compiled).toBeUndefined();
    const onDemand = compileWith(c, true);
    expect(onDemand.compiled, "short-circuit must not serve undefined").toBeTruthy();
    expect(JSON.stringify(onDemand.compiled)).toBe(coldCompiled(SOURCE));
  });

  it("matches a cold compile after a sequence of edits", () => {
    // A single-compile test would never reach the short-circuit. Typing first
    // is what makes the cached-program path the one under test.
    const c = makeCompiler(SOURCE, false);
    let text = SOURCE;
    compileWith(c);
    for (let i = 0; i < 4; i += 1) {
      text = edit(c, text, i + 2);
      expect(compileWith(c).compiled, `edit ${i + 1}`).toBeUndefined();
    }
    const pulled = compileWith(c, true);
    expect(JSON.stringify(pulled.compiled)).toBe(coldCompiled(text));
  });

  it("serves the same bytecode when pulled twice without an edit", () => {
    // The second pull hits the short-circuit with bytecode already attached,
    // so it must neither re-serialize into something different nor drop it.
    const c = makeCompiler(SOURCE, false);
    compileWith(c);
    const first = JSON.stringify(compileWith(c, true).compiled);
    const second = JSON.stringify(compileWith(c, true).compiled);
    expect(second).toBe(first);
    expect(first).toBe(coldCompiled(SOURCE));
  });

  it("leaves diagnostics and pathLocations untouched either way", () => {
    const c = makeCompiler(SOURCE, false);
    const suppressed = compileWith(c);
    const pulled = compileWith(c, true);
    expect(JSON.stringify(pulled.pathLocations)).toBe(
      JSON.stringify(suppressed.pathLocations),
    );
    expect(JSON.stringify(pulled.diagnostics ?? {})).toBe(
      JSON.stringify(suppressed.diagnostics ?? {}),
    );
    expect(Object.keys(pulled.pathLocations ?? {}).length).toBeGreaterThan(0);
  });
});
