// Reuse of the two per-flow caches when content OUTSIDE every flow changes.
//
// Both caches — the serialized-bytecode memo consulted by `computeFlowReuse`
// and the location/asset cache consulted by `populateAllLocations` — hold a
// flow's result across compiles and re-serve it when that flow's own source
// chunks did not change. That is only sound while an unchanged flow's
// generated shape is stable, so the compiler answers a second question once
// per compile: can anything this compile have changed the shape of a flow
// whose own chunks are unchanged?
//
// The answer is position-independent. Top-level flows are name-addressed in
// the runtime's `namedOnlyContent`, so their internal index-addressed paths do
// not move when content outside them grows or shrinks, and constants and
// globals are read through runtime variable lookups rather than copied into
// referencing flows (#309). What does change a flow's shape is a declared
// NAME entering or leaving the program, a change to the `include`/`run`/
// `external` structure, or a callee's parameter list — and each of those is
// detected wherever in the document it is written. (A list definition is the
// fourth such hazard, and has no test here because authored Sparkdown has no
// list syntax; see the `_unchangedFlowShapeAtRisk` declaration.)
//
// So the tests pair each case with the position it sits at, and there is one
// per detector a script can actually reach, so a feed that stops arming the
// guard turns this file red rather than passing quietly. Each asserts the
// reuse DECISION rather than only that the output matches a cold compile: a
// flow served from a valid cache and a flow rebuilt from scratch produce the
// same bytes, so output equality alone cannot tell a working cache from a
// disabled one.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const URI = "file://proj/main.sd";
const SCENES = 12;

const file = (text: string, version: number): File => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

/**
 * Exposes both reuse decisions, which are made independently.
 *
 * `computeFlowReuse`'s verdict is a set of flow names that never reaches the
 * compiled output, so it is recorded as it is computed. The location and asset
 * guard's verdict is read from the per-flow asset captures: a flow it reused
 * contributes the very object it produced last compile, a recomputed one
 * contributes a new object, so object identity tells the two apart.
 */
class Probe extends SparkdownCompiler {
  lastBytecodeReuse?: { reusable: Set<string>; ok: boolean };

  captures(): Map<string, unknown> {
    return new Map(this._flowAssetAccum ?? []);
  }

  protected override computeFlowReuse(story: RuntimeStory) {
    const result = super.computeFlowReuse(story);
    this.lastBytecodeReuse = {
      reusable: new Set(result.reusable),
      ok: result.ok,
    };
    return result;
  }
}

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
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

/** Key-sorted JSON, so two compiled programs compare structurally. */
const stable = (value: unknown): string => {
  const seen = new WeakSet();
  const walk = (x: any): any => {
    if (x && typeof x === "object") {
      if (seen.has(x)) {
        return "[circular]";
      }
      seen.add(x);
      if (Array.isArray(x)) {
        return x.map(walk);
      }
      const out: any = {};
      for (const key of Object.keys(x).sort()) {
        out[key] = walk(x[key]);
      }
      return out;
    }
    return x;
  };
  return JSON.stringify(walk(value));
};

function edit(
  compiler: SparkdownCompiler,
  text: string,
  find: string,
  replace: string,
  version: number,
) {
  const offset = text.indexOf(find);
  expect(offset, `find ${JSON.stringify(find)}`).toBeGreaterThanOrEqual(0);
  compiler.updateDocument({
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
  } as any);
  return text.slice(0, offset) + replace + text.slice(offset + find.length);
}

/** The player worker's configuration, which is where reuse actually runs. */
function configured<T extends SparkdownCompiler>(compiler: T, text: string): T {
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [file(text, 1)],
  } as any);
  return compiler;
}

function compiledOf(compiler: SparkdownCompiler) {
  return (compiler.compile({ textDocument: { uri: URI } } as any) as any).program
    .compiled;
}

function coldCompiledOf(text: string) {
  return compiledOf(configured(new SparkdownCompiler(), text));
}

/**
 * Twelve five-line scenes with `const LIMIT = 5` on line 0 and the first scene
 * on line 2, so every scene is far enough from the preamble that only the
 * first one is adjacent to it.
 *
 * Every scene READS the constant. That matters: a scene that never mentions
 * `LIMIT` would keep its reuse whatever the constant did, so the constant
 * tests below would pass over dead code. Reading it puts a variable reference
 * in each scene's bytecode, which is what a cached flow would carry across a
 * change to the constant.
 */
function fixture(): string {
  const lines: string[] = ["const LIMIT = 5", ""];
  for (let s = 0; s < SCENES; s++) {
    lines.push(`scene s${s}`);
    lines.push(`  [[show backdrop room_${s}]]`);
    lines.push(`  Line ${s} of the fixture, limit {LIMIT}.`);
    lines.push(`  -> s${(s + 1) % SCENES}`);
    lines.push("end");
  }
  return lines.join("\n");
}

type Outcome = {
  /** Did the bytecode guard allow any reuse at all this compile? */
  bytecodeGuardOk: boolean;
  /** Flows the bytecode guard cleared for reuse. */
  bytecodeReused: number;
  /** Flows the location and asset guard actually re-served. */
  locationsReused: number;
  /** Does the incremental program equal a cold compile of the same text? */
  matchesCold: boolean;
};

/**
 * Compile the fixture, warm both caches with one in-scene edit, then apply
 * `second` and report what the next compile reused.
 */
function measure(second: { find: string; replace: string }): Outcome {
  return quiet(() => {
    let text = fixture();
    const compiler = configured(new Probe(), text);
    compiler.compile({ textDocument: { uri: URI } } as any);

    text = edit(compiler, text, "Line 3 of", "Line 3 from", 2);
    compiler.compile({ textDocument: { uri: URI } } as any);
    const warmCaptures = compiler.captures();

    text = edit(compiler, text, second.find, second.replace, 3);
    const compiled = compiledOf(compiler);
    const afterCaptures = compiler.captures();

    let locationsReused = 0;
    for (const [name, capture] of afterCaptures) {
      // "0" is the root's pseudo-flow, which is never cached.
      if (name !== "0" && warmCaptures.get(name) === capture) {
        locationsReused++;
      }
    }
    const bytecode = compiler.lastBytecodeReuse!;
    return {
      bytecodeGuardOk: bytecode.ok,
      bytecodeReused: bytecode.reusable.size,
      locationsReused,
      matchesCold: stable(compiled) === stable(coldCompiledOf(text)),
    };
  });
}

describe("incremental reuse when content outside a flow changes", () => {
  // An in-scene edit is the reference point every other case is read against:
  // it is the shape reuse is designed for, and it reuses everything but the
  // edited scene.
  const IN_SCENE_BASELINE = SCENES - 1;

  it("an in-scene edit reuses every other flow in both caches", () => {
    const outcome = measure({
      find: "Line 7 of",
      replace: "Line 7 from",
    });
    expect(outcome.bytecodeGuardOk).toBe(true);
    expect(outcome.bytecodeReused).toBe(IN_SCENE_BASELINE);
    expect(outcome.locationsReused).toBe(IN_SCENE_BASELINE);
    expect(outcome.matchesCold).toBe(true);
  });

  // #309 made a constant an ordinary global initialized once rather than a
  // value copied into every referencing flow, so its VALUE cannot change any
  // flow's shape. Editing one above the first scene therefore has to keep
  // reuse — asserted as a count, because the compiled output of a correctly
  // reused flow and a rebuilt one are identical.
  //
  // The counts are `at least` the in-scene baseline rather than exactly it.
  // What the case is about is that reuse survives at all, where it used to
  // drop to zero; whether the scene ADJACENT to the preamble also survives
  // depends on where the parser happens to end the preamble's chunk, and
  // pinning that would turn a parser improvement into a red test.
  it("editing a constant's value above the first flow keeps reuse in both caches", () => {
    const outcome = measure({
      find: "const LIMIT = 5",
      replace: "const LIMIT = 6",
    });
    expect(outcome.bytecodeGuardOk).toBe(true);
    expect(outcome.bytecodeReused).toBeGreaterThanOrEqual(IN_SCENE_BASELINE);
    expect(outcome.locationsReused).toBeGreaterThanOrEqual(IN_SCENE_BASELINE);
    expect(outcome.matchesCold).toBe(true);
  });

  // Retyping the constant, not just renumbering it, is the case the guard's
  // own superseded comment named: a constant used to be inlined at generation
  // and a string expanded to a different number of runtime objects than a
  // number, so retyping shifted sibling indices inside untouched flows. Since
  // #309 the scenes hold a variable reference rather than the value, and the
  // reference serializes the same whatever the constant's type, so reuse must
  // survive this too — and the cold comparison is what would catch it if the
  // type ever leaked back into a cached flow.
  it("retyping a constant above the first flow keeps reuse in both caches", () => {
    const outcome = measure({
      find: "const LIMIT = 5",
      replace: 'const LIMIT = "five"',
    });
    expect(outcome.bytecodeGuardOk).toBe(true);
    expect(outcome.bytecodeReused).toBeGreaterThanOrEqual(IN_SCENE_BASELINE);
    expect(outcome.locationsReused).toBeGreaterThanOrEqual(IN_SCENE_BASELINE);
    expect(outcome.matchesCold).toBe(true);
  });

  // Loose prose after the last scene is root content: it becomes part of the
  // root's own positional prefix, which is never cached, and reaches no named
  // flow. Nothing is invalidated, and unlike the case above not even the
  // adjacent scene, since the insertion is below every flow's body.
  it("loose text after the last flow keeps reuse in both caches", () => {
    const outcome = measure({
      find: `  -> s0\nend`,
      replace: `  -> s0\nend\n\nA trailing line of prose.`,
    });
    expect(outcome.bytecodeGuardOk).toBe(true);
    expect(outcome.bytecodeReused).toBe(SCENES);
    expect(outcome.locationsReused).toBe(SCENES);
    expect(outcome.matchesCold).toBe(true);
  });

  // A declared name entering the program is a real hazard: generation
  // consults `story.variableDeclarations` when resolving call targets, so a
  // new name can change the codegen of call sites in flows whose own source
  // did not change. Position must not matter — these three write the same
  // kind of declaration above the first flow, between two flows, and after
  // the last flow, and all three must refuse reuse. Remove the invalidation
  // and the between/after cases start re-serving stale flows.
  for (const [where, step] of [
    [
      "above the first flow",
      { find: "const LIMIT = 5", replace: "store extra = 1\nconst LIMIT = 5" },
    ],
    [
      "between two flows",
      { find: "scene s6", replace: "store extra = 1\n\nscene s6" },
    ],
    [
      "after the last flow",
      { find: `  -> s0\nend`, replace: `  -> s0\nend\n\nstore extra = 1` },
    ],
  ] as const) {
    it(`declaring a global ${where} refuses reuse in both caches`, () => {
      const outcome = measure(step);
      expect(outcome.bytecodeGuardOk).toBe(false);
      expect(outcome.bytecodeReused).toBe(0);
      expect(outcome.locationsReused).toBe(0);
      expect(outcome.matchesCold).toBe(true);
    });
  }
});

// The hazard above, made observable in the compiled output rather than only in
// a reuse count. Every scene calls a flow that takes a parameter; declaring a
// global with that flow's name shadows it, which flips each call site from
// knot-call codegen to variable-target codegen. The calling scenes' own source
// never changes, so a cache that re-serves them emits the pre-shadowing
// bytecode and the program stops matching a cold compile of the same text.
//
// The declaration is written between two scenes on purpose: it is the position
// a rule that only looks above the first flow cannot see.
describe("a global that shadows a flow name", () => {
  function shadowFixture(): string {
    const lines: string[] = [];
    for (let s = 0; s < SCENES; s++) {
      lines.push(`scene s${s}`);
      lines.push(`  Line ${s}.`);
      lines.push(`  -> helper(${s}) ->`);
      lines.push(`  -> s${(s + 1) % SCENES}`);
      lines.push("end");
      lines.push("");
    }
    lines.push("scene helper(n: number)");
    lines.push("  Helper got {n}.");
    lines.push("end");
    return lines.join("\n");
  }

  for (const where of ["above the first flow", "between two flows"] as const) {
    it(`declared ${where}, the calling flows are not served from cache`, () => {
      quiet(() => {
        let text = shadowFixture();
        const compiler = configured(new Probe(), text);
        compiler.compile({ textDocument: { uri: URI } } as any);
        text = edit(compiler, text, "Line 3.", "Line 3!", 2);
        compiler.compile({ textDocument: { uri: URI } } as any);

        const anchor = where === "above the first flow" ? "scene s0" : "scene s6";
        text = edit(compiler, text, anchor, `store helper = 1\n\n${anchor}`, 3);
        const compiled = compiledOf(compiler);

        expect(compiler.lastBytecodeReuse?.ok).toBe(false);
        expect(stable(compiled)).toEqual(stable(coldCompiledOf(text)));
      });
    });
  }

  // The callee's parameter list is baked into its CALLERS' bytecode at their
  // generation time, so changing it has to invalidate flows whose own source
  // is untouched. That is the flow-signature detector, and this is the only
  // test that reaches it: nothing else here changes a signature, so if its
  // feed into the shape-risk field were removed, every other test would still
  // pass while the callers were served pre-change bytecode.
  it("changing a callee's parameter list refuses reuse for its callers", () => {
    quiet(() => {
      let text = shadowFixture();
      const compiler = configured(new Probe(), text);
      compiler.compile({ textDocument: { uri: URI } } as any);
      text = edit(compiler, text, "Line 3.", "Line 3!", 2);
      compiler.compile({ textDocument: { uri: URI } } as any);
      expect(compiler.lastBytecodeReuse?.ok).toBe(true);

      text = edit(
        compiler,
        text,
        "scene helper(n: number)",
        "scene helper(n: number, m: number)",
        3,
      );
      const compiled = compiledOf(compiler);

      expect(compiler.lastBytecodeReuse?.ok).toBe(false);
      expect(compiler.lastBytecodeReuse?.reusable.size).toBe(0);
      expect(stable(compiled)).toEqual(stable(coldCompiledOf(text)));
    });
  });
});

// The remaining reachable detectors, one test each, so a feed that stops
// firing turns this file red rather than passing quietly. (The list detector
// has no test because authored Sparkdown has no list syntax — see the
// `_unchangedFlowShapeAtRisk` declaration.)
describe("the other detectors that arm the shape-risk guard", () => {
  // An `external` declaration decides whether a call site compiles to an
  // external call, which a cached flow cannot re-derive. Its name and arity
  // are the root-region structure descriptor, alongside `include` and `run`
  // targets. (The keyword is lowercase; ink's uppercase `EXTERNAL` is not
  // Sparkdown syntax and parses as ordinary content.)
  //
  // The edit changes the ARITY and leaves the NAME alone, on purpose. Adding
  // or removing an external also moves the declared-name census, so a test
  // that added one would pass on the census detector alone and say nothing
  // about this one. Only the arity distinguishes them.
  it("changing an external declaration's arity refuses reuse in both caches", () => {
    const withExternal = () =>
      fixture().replace(
        "const LIMIT = 5",
        "const LIMIT = 5\nexternal myAction()",
      );
    const outcome = quiet(() => {
      let text = withExternal();
      const compiler = configured(new Probe(), text);
      compiler.compile({ textDocument: { uri: URI } } as any);
      text = edit(compiler, text, "Line 3 of", "Line 3 from", 2);
      compiler.compile({ textDocument: { uri: URI } } as any);
      const warm = compiler.captures();
      expect(compiler.lastBytecodeReuse?.ok).toBe(true);

      text = edit(compiler, text, "external myAction()", "external myAction(a)", 3);
      const compiled = compiledOf(compiler);
      const after = compiler.captures();
      let locationsReused = 0;
      for (const [name, capture] of after) {
        if (name !== "0" && warm.get(name) === capture) {
          locationsReused++;
        }
      }
      return {
        ok: compiler.lastBytecodeReuse!.ok,
        reused: compiler.lastBytecodeReuse!.reusable.size,
        locationsReused,
        matchesCold: stable(compiled) === stable(coldCompiledOf(text)),
      };
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reused).toBe(0);
    expect(outcome.locationsReused).toBe(0);
    expect(outcome.matchesCold).toBe(true);
  });

  // A compile that throws drops the declared-name census baseline, so the
  // NEXT compile cannot detect a name change — the signal both caches lean on
  // hardest. That compile has to refuse them. The throw is injected rather
  // than provoked from source, because a script that makes the compiler throw
  // would be a bug worth fixing on its own.
  //
  // This pins the BEHAVIOUR, not the mechanism. Deleting the next-compile
  // latch alone leaves it green, because the same catch block also drops the
  // root-region descriptor baseline, and that detector then arms the guard on
  // the next compile by itself. The latch is kept anyway: it states the
  // requirement where the census is dropped rather than leaving it resting on
  // a second, unrelated line of cleanup.
  it("the compile after one that threw refuses reuse in both caches", () => {
    quiet(() => {
      let text = fixture();
      const compiler = configured(new Probe(), text);
      compiler.compile({ textDocument: { uri: URI } } as any);
      text = edit(compiler, text, "Line 3 of", "Line 3 from", 2);
      compiler.compile({ textDocument: { uri: URI } } as any);
      expect(compiler.lastBytecodeReuse?.ok).toBe(true);

      // `compile` catches and swallows, so the throw shows up as the compile
      // running its recovery path rather than as an exception here.
      const real = compiler.populateAllLocations.bind(compiler);
      let threw = false;
      (compiler as any).populateAllLocations = () => {
        threw = true;
        throw new Error("injected");
      };
      text = edit(compiler, text, "Line 4 of", "Line 4 from", 3);
      compiler.compile({ textDocument: { uri: URI } } as any);
      (compiler as any).populateAllLocations = real;
      expect(threw).toBe(true);

      // The compile after the throw: nothing about its own edit is hazardous,
      // yet both caches must be refused because the census baseline is gone.
      text = edit(compiler, text, "Line 5 of", "Line 5 from", 4);
      const compiled = compiledOf(compiler);
      expect(compiler.lastBytecodeReuse?.ok).toBe(false);
      expect(compiler.lastBytecodeReuse?.reusable.size).toBe(0);
      expect(stable(compiled)).toEqual(stable(coldCompiledOf(text)));
    });
  });
});
