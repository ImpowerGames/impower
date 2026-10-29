import { describe, expect, it } from "vitest";
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

function soleCall(compiler: SparkdownCompiler, name: string): FunctionCall {
  const calls = reachableFunctionCalls(compiler).filter((f) => {
    try {
      return f.name === name;
    } catch {
      return false;
    }
  });
  expect({ name, count: calls.length }).toEqual({ name, count: 1 });
  return calls[0]!;
}

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

function compileBuilt(compiler: SparkdownCompiler): void {
  const { program } = quiet(() =>
    compiler.compile({ textDocument: { uri: URI } } as never),
  );
  expect(!!program.chunks, "the compile built its statement chunks").toBe(true);
}

function compiledOnce(text: string): SparkdownCompiler {
  const compiler = configured(text);
  compileBuilt(compiler);
  return compiler;
}

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

describe("FunctionCall preparation leaves `content` intact", () => {
  for (const form of COUNTED_FORMS) {
    it(`repeated preparation keeps exactly the counted argument: ${form.label}`, () => {
      const callerLine = form.line ?? `  Caller action {${form.label}}.`;
      const compiler = compiledOnce(doc(callerLine, form.preamble));

      const call = soleCall(compiler, form.name);
      expect(call.args.length).toBe(1);

      expectContentIsCountedArgOnly(call, "after first compile");

      for (let i = 0; i < 5; i++) {
        quiet(() => call.PrepareIntoContainer());
        expectContentIsCountedArgOnly(call, `after extra preparation ${i + 1}`);
      }
    });
  }

  it("the proxy-divert splice removes only the proxy divert", () => {
    const compiler = compiledOnce(doc("  Caller action {FLOOR(1.5)}."));
    const call = soleCall(compiler, "FLOOR");

    expect({ where: "after first compile", length: call.content.length }).toEqual({
      where: "after first compile",
      length: 0,
    });

    const sentinel = new Text("sentinel");
    call.content.push(sentinel);

    quiet(() => call.PrepareIntoContainer());
    expect({
      prepared: true,
      length: call.content.length,
      survived: call.content[0] === sentinel,
    }).toEqual({ prepared: true, length: 1, survived: true });
  });

  it("survives the real multi-pass path: deleting the divert target", () => {
    const base = doc(CALLER_LINE);
    const compiler = compiledOnce(base);

    const call = soleCall(compiler, "TURNS_SINCE");
    let passes = 0;
    const prepare = call.PrepareIntoContainer.bind(call);
    (call as any).PrepareIntoContainer = () => {
      passes += 1;
      return prepare();
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
      });
      compileBuilt(compiler);
      text =
        text.slice(0, offset) +
        step.replace +
        text.slice(offset + step.find.length);

      expect(soleCall(compiler, "TURNS_SINCE") === call).toBe(true);
      expectContentIsCountedArgOnly(call, `after step ${i + 1}`);

      if (i === deletionStep) {
        expect({
          step: "delete divert target",
          regenerated: passes > passesBeforeDeletion,
        }).toEqual({ step: "delete divert target", regenerated: true });
      }
    }
  });
});
