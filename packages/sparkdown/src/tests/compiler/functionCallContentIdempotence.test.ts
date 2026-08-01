// `FunctionCall.GenerateIntoContainer` must leave `this.content` holding
// exactly what the rest of the compiler expects, on the first generation pass
// and on every subsequent one — the incremental pipeline carries parsed chunks
// forward by identity, so a carried-forward `FunctionCall` generates more than
// once (measured: deleting a divert target regenerates its caller's node).
//
// Two halves of that method write to `content`, and they used to be coupled by
// accident (issue #323):
//
//   - the TURNS_SINCE / READ_COUNT branch `AddContent`s the counted argument —
//     the same parsed node every pass;
//   - the tail `splice(this.content.indexOf(this._proxyDivert), 1)` deletes the
//     TRAILING element once the proxy divert is already gone, because
//     `indexOf` returns -1 and `splice(-1, 1)` splices from the end.
//
// On the counted-argument branch those two cancel exactly — the element the
// stray splice reaches is the duplicate the stray add just pushed — so
// `content` settled on the right single entry and nothing accumulated. That
// cancellation is what makes the two halves impossible to change one at a
// time: guarding only the splice grows `content` by one entry per pass, and
// guarding only the `AddContent` empties it, which drops the counted argument
// out of every content-based tree walk (`ParsedObject.ResolveReferences`'s own
// recursion, `Find`/`FindAll`, `CollectByType`).
//
// The third test below is the one that goes red on the unguarded splice alone:
// on a branch that adds nothing, there is no duplicate for `splice(-1, 1)` to
// land on, so it deletes real content instead.
//
// A note on assertion style: parsed nodes are deeply cyclic, and a failing
// `expect(node).toBe(other)` makes vitest build a diff of the whole graph,
// which exhausts the worker heap and reports as "Worker exited unexpectedly"
// instead of as the assertion that failed. Every node comparison here is
// reduced to a boolean BEFORE it reaches `expect`.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { Container as RuntimeContainer } from "../../inkjs/engine/Container";
import { FunctionCall } from "../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const quiet = <T,>(fn: () => T): T => {
  const w = console.warn;
  const e = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = w;
    console.error = e;
  }
};

/** Every `FunctionCall` reachable from the compiler, in discovery order. */
function reachableFunctionCalls(root: object): FunctionCall[] {
  const seen = new Set<unknown>([root]);
  const queue: any[] = [root];
  const found: FunctionCall[] = [];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur instanceof FunctionCall) {
      found.push(cur);
    }
    let children: unknown[];
    if (Array.isArray(cur)) {
      children = cur;
    } else if (cur instanceof Set) {
      children = [...cur];
    } else if (cur instanceof Map) {
      children = [...cur.keys(), ...cur.values()];
    } else {
      children = [];
      for (const key of Object.getOwnPropertyNames(cur)) {
        // Skip accessors — invoking a getter here could compute or throw.
        const d = Object.getOwnPropertyDescriptor(cur, key);
        if (d && !d.get) children.push(d.value);
      }
    }
    for (const child of children) {
      if (!child) continue;
      const t = typeof child;
      if (t !== "object" && t !== "function") continue;
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return found;
}

/** The one reachable `FunctionCall` with this name. Fails if there isn't exactly one. */
function soleCall(compiler: SparkdownCompiler, name: string): FunctionCall {
  const calls = reachableFunctionCalls(compiler).filter((f) => {
    // `name` throws if a call has no parsed target path; treat that as "not
    // the one we're looking for" rather than as an opaque TypeError.
    try {
      return f.name === name;
    } catch {
      return false;
    }
  });
  expect({ name, count: calls.length }).toEqual({ name, count: 1 });
  return calls[0]!;
}

/**
 * `content` must be exactly the counted argument — the parsed node that is
 * also `args[0]` — and nothing else. Reported as plain numbers/booleans so a
 * failure prints a readable assertion instead of a graph diff.
 */
function expectContentIsCountedArgOnly(call: FunctionCall, label: string) {
  const countedArg = call.args[0];
  expect({
    where: label,
    length: call.content.length,
    firstIsCountedArg: call.content[0] === countedArg,
    holdsProxyDivert: call.content.includes(call.proxyDivert),
    countedArgParentIsCall: countedArg?.parent === call,
  }).toEqual({
    where: label,
    length: 1,
    firstIsCountedArg: true,
    holdsProxyDivert: false,
    // `AddContent`'s other effect. `DivertTarget.ResolveReferences` reads it
    // to decide turn-counting vs. count-everything, so it has to survive the
    // passes that no longer re-add.
    countedArgParentIsCall: true,
  });
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

function configured(text: string): SparkdownCompiler {
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

function compiledOnce(text: string): SparkdownCompiler {
  const compiler = configured(text);
  quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));
  return compiler;
}

// Same document shape as `incrementalStaleTargetPaths.test.ts`: no front
// matter, a `caller` scene holding the call under test, filler scenes to edit
// in, and a `gamma` scene to delete. Measured, not assumed: this is the shape
// that actually drives a SECOND generation pass over a carried-forward
// `FunctionCall`. Deleting the divert target is what forces the regeneration —
// warm edits alone leave the node at a single pass, and editing inside the
// caller scene re-parses it into a fresh node each time.
function doc(callerLine: string, preamble: string[] = []): string {
  const L: string[] = [...preamble];
  L.push("scene caller");
  L.push(":");
  L.push("  Caller action.");
  L.push(callerLine);
  L.push("-> DONE");
  L.push("end");
  L.push("");
  for (let i = 0; i < 3; i++) {
    L.push(`scene filler_${i}`);
    L.push(":");
    L.push(`  Filler action ${i}.`);
    L.push("-> DONE");
    L.push("end");
    L.push("");
  }
  L.push("scene gamma");
  L.push(":");
  L.push("  Gamma action.");
  L.push("-> DONE");
  L.push("end");
  L.push("");
  return L.join("\n");
}

const CALLER_LINE = "  Caller action {TURNS_SINCE(-> gamma)}.";
const GAMMA_BLOCK = "scene gamma\n:\n  Gamma action.\n-> DONE\nend\n";
const WARM = (n: number) => ({
  find: `Filler action 1.${"!".repeat(n)}`,
  replace: `Filler action 1.${"!".repeat(n + 1)}`,
});

// Both counted-argument shapes: a `-> knot` DivertTarget, and the no-arrow
// VariableReference form (as in the runtime fixture
// `builtins/read-count-variable-target.sd`), which takes the other arm of the
// guarded `AddContentOnce` call.
const COUNTED_FORMS = [
  { label: "TURNS_SINCE(-> gamma)", name: "TURNS_SINCE", preamble: [] as string[] },
  { label: "READ_COUNT(-> gamma)", name: "READ_COUNT", preamble: [] as string[] },
  {
    label: "READ_COUNT(x) — variable target",
    name: "READ_COUNT",
    preamble: ["store x = -> gamma", ""],
    line: "  Caller action {READ_COUNT(x)}.",
  },
];

describe("FunctionCall generation leaves `content` intact", () => {
  for (const form of COUNTED_FORMS) {
    it(`repeated generation keeps exactly the counted argument: ${form.label}`, () => {
      const callerLine = form.line ?? `  Caller action {${form.label}}.`;
      const compiler = compiledOnce(doc(callerLine, form.preamble));

      const call = soleCall(compiler, form.name);
      expect(call.args.length).toBe(1);

      // After the first pass the proxy divert is gone (this is not a normal
      // function call) and the counted argument has taken its place.
      expectContentIsCountedArgOnly(call, "after first compile");

      const emitted: number[] = [];
      for (let i = 0; i < 5; i++) {
        const container = new RuntimeContainer();
        quiet(() => call.GenerateIntoContainer(container));
        emitted.push(container.content.length);

        // Guarding only the splice grows this by one entry per pass; guarding
        // only the `AddContent` empties it.
        expectContentIsCountedArgOnly(call, `after extra pass ${i + 1}`);
      }

      // Weak sanity check only, and deliberately so: it catches a guard that
      // stopped generation emitting altogether, not a change in WHAT is
      // emitted. The emitted-object-level oracle is the incremental-vs-cold
      // comparison in `incrementalStaleTargetPaths.test.ts`, which covers this
      // same fixture.
      expect(new Set(emitted).size).toBe(1);
      expect(emitted[0]).toBeGreaterThan(0);
    });
  }

  it("the proxy-divert splice removes only the proxy divert", () => {
    // A builtin whose branch adds nothing to `content`: after pass 1 the proxy
    // divert has been spliced out and `content` is empty, so a second pass
    // reaches the splice with `indexOf(...) === -1` and NO duplicate sitting at
    // the end to absorb it. Whatever `content` ends with is what an unguarded
    // `splice(-1, 1)` deletes — which is the defect in the ticket title.
    const compiler = compiledOnce(doc("  Caller action {FLOOR(1.5)}."));
    const call = soleCall(compiler, "FLOOR");

    expect({ where: "after first compile", length: call.content.length }).toEqual({
      where: "after first compile",
      length: 0,
    });

    const sentinel = new Text("sentinel");
    call.content.push(sentinel);

    const container = new RuntimeContainer();
    quiet(() => call.GenerateIntoContainer(container));

    // The sentinel is not the proxy divert, so the splice must not touch it.
    expect({
      length: call.content.length,
      survived: call.content[0] === sentinel,
    }).toEqual({ length: 1, survived: true });
  });

  it("survives the real multi-pass path: deleting the divert target", () => {
    const base = doc(CALLER_LINE);
    const compiler = compiledOnce(base);

    // Generation pass 1 has happened. Instrument the carried-forward node so
    // the assertions below cannot pass vacuously by never regenerating.
    // `GenerateIntoContainer` is an instance field and every caller reaches it
    // by property access on the instance, so this wrapper sees every pass.
    const call = soleCall(compiler, "TURNS_SINCE");
    let passes = 0;
    const generate = call.GenerateIntoContainer;
    (call as any).GenerateIntoContainer = (container: RuntimeContainer) => {
      passes += 1;
      return generate(container);
    };

    let text = base;
    let version = 1;
    const steps = [
      WARM(0),
      WARM(1),
      WARM(2),
      { find: GAMMA_BLOCK, replace: "" },
      WARM(3),
    ];
    const deletionStep = 3;
    let passesBeforeDeletion = -1;

    for (const [i, step] of steps.entries()) {
      if (i === deletionStep) {
        passesBeforeDeletion = passes;
      }
      const offset = text.indexOf(step.find);
      expect(offset).toBeGreaterThanOrEqual(0);
      version += 1;
      quiet(() => {
        compiler.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [
            {
              range: {
                start: posAt(text, offset),
                end: posAt(text, offset + step.find.length),
              },
              text: step.replace,
            },
          ],
        } as never);
        compiler.compile({ textDocument: { uri: URI } } as never);
      });
      text =
        text.slice(0, offset) +
        step.replace +
        text.slice(offset + step.find.length);

      // The node is carried forward by identity for this whole sequence, so
      // its `content` must survive every one of those compiles.
      expect(soleCall(compiler, "TURNS_SINCE") === call).toBe(true);
      expectContentIsCountedArgOnly(call, `after step ${i + 1}`);

      if (i === deletionStep) {
        // Pin WHICH edit drives the regeneration. If invalidation changes so
        // that deleting the target no longer regenerates the caller, this
        // fails rather than quietly covering something else.
        expect({
          step: "delete divert target",
          regenerated: passes > passesBeforeDeletion,
        }).toEqual({ step: "delete divert target", regenerated: true });
      }
    }
  });
});
