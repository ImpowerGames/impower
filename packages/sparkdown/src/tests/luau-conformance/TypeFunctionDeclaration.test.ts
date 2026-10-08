// A Luau user-defined type function, `type function F(t) ... end`, is one
// declaration: its body belongs to it, its `end` closes it, and the code
// after it stays in the enclosing function. A type function runs only while
// types are checked, so the compiled story contains nothing for it.

import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { testCompiler, testStory } from "../engineUnderTest";

// The editor's annotations of each occurrence of the whole word `word` in
// `text`, by annotation set.
function annotationsOf(text: string, word: string) {
  const uri = "inmemory:///main.sd";
  const registry = new SparkdownDocumentRegistry(["semantics", "references"]);
  registry.add({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  const annotations = registry.annotations(uri) as Record<string, any>;
  const occurrences: Record<string, unknown>[] = [];
  for (const match of text.matchAll(new RegExp(`(?<![A-Za-z0-9_])${word}(?![A-Za-z0-9_])`, "g"))) {
    const at = match.index!;
    const found: Record<string, unknown> = {};
    for (const key of ["semantics", "references"]) {
      const iter = annotations[key]!.iter(0);
      while (iter.value) {
        if (iter.from === at && iter.to === at + word.length) found[key] = iter.value.type;
        iter.next();
      }
    }
    occurrences.push(found);
  }
  return occurrences;
}

function run(files: Array<{ uri: string; text: string }>) {
  const compiler = testCompiler();
  compiler.configure({
    files: files.map((f) => ({
      uri: f.uri,
      type: "script",
      name: f.uri.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "main",
      ext: f.uri.endsWith(".luau") ? "luau" : "sd",
      text: f.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });
  const result = compiler.compile({ textDocument: { uri: files[0]!.uri } });
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const diagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of diagnostics) {
      const raw = (d as any).message;
      const message = typeof raw === "string" ? raw : (raw?.value ?? JSON.stringify(d));
      if ((d as any).severity === 1) errors.push(message);
      else if ((d as any).severity === 2) warnings.push(message);
    }
  }
  const story = testStory(result.program.chunks);
  const recorded: unknown[] = [];
  story.BindExternalFunction("harness_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.ContinueMaximally();
  return { errors, warnings, recorded };
}

describe("type function declaration", () => {
  test.each([
    ["an untyped parameter", `type function F(t)\n    return t\nend\nlocal x = 1\n`],
    ["a typed parameter and return type", `type function F(t: type): type\n    return t\nend\nlocal x = 1\n`],
    ["a type alias after it", `type function F(t)\n    return t\nend\ntype C = { a: number }\n`],
    ["export", `export type function F(t)\n    return t\nend\nlocal x = 1\n`],
    ["a one-line body holding a function", `type function F(t) local function g() return t end return g() end\nlocal x = 1\n`],
    ["a nested block", `type function F(t)\n    if t:is("number") then\n        return t\n    end\n    return t\nend\nlocal x = 1\n`],
  ])("reads the whole declaration with %s", (_, source) => {
    expect(checkLuau(source).syntaxDiagnostics).toEqual([]);
  });

  test("code after it in a run file stays in the file's function", () => {
    const { errors, warnings, recorded } = run([
      { uri: "inmemory:///main.sd", text: `external harness_record(v)\nrun "helpers"\ndone\n` },
      {
        uri: "inmemory:///helpers.luau",
        text: `local a = 5\n& harness_record(a)\ntype function F(t)\n    return t\nend\n& harness_record(a)\n`,
      },
    ]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(recorded).toEqual([5, 5]);
  });

  test("code after it in a script function stays in that function", () => {
    const { errors, warnings, recorded } = run([
      {
        uri: "inmemory:///main.sd",
        text: `external harness_record(v)
& f()
& harness_record(3)
done

function f()
  local a = 1
  harness_record(a)
  type function F(t)
    return t
  end
  harness_record(a + 1)
end
`,
      },
    ]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });

  test("the compiler does not resolve its parameters after its end", () => {
    const { warnings } = run([
      {
        uri: "inmemory:///main.sd",
        text: `external harness_record(v)
& f()
done

function f()
  type function F(t)
    return t
  end
  harness_record(t)
end
`,
      },
    ]);
    expect(warnings).toEqual(["Cannot find variable named `t`"]);
  });

  test("the editor does not bind its parameters after its end", () => {
    const script = (parameter: string) => `function f()
  type function F(${parameter})
    return ${parameter}
  end
  return t
end
`;
    // The last `t` is the one after `end`. With nothing bound it reads as it
    // does when the type function's parameter has another name: a reference
    // to an unresolved name.
    const control = annotationsOf(script("p"), "t").at(-1);
    expect(control).toHaveProperty("references");
    expect(annotationsOf(script("t"), "t").at(-1)).toEqual(control);
  });

  test("editing around it leaves the names after it as a cold parse reads them", () => {
    const filler = (name: string) =>
      Array.from({ length: 40 }, (_, i) => `  local ${name}${i} = ${i}`).join("\n");
    let text = `function raise()
${filler("v")}
  type function Wrap(mat)
    local strin = mat
    return strin
  end
${filler("w")}
  local a = math.floor(2.5)
  local b = string.len("a")
  return a + b
end
`;
    const uri = "inmemory:///main.sd";
    const incremental = new SparkdownDocumentRegistry(["semantics"]);
    incremental.add({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
    const semanticsAfterEnd = (registry: SparkdownDocumentRegistry) => {
      const out: string[] = [];
      const iter = (registry.annotations(uri) as Record<string, any>)["semantics"]!.iter(text.indexOf("local a = "));
      while (iter.value) {
        out.push(`${iter.from}-${iter.to} ${JSON.stringify(iter.value.type)}`);
        iter.next();
      }
      return out;
    };
    const position = (offset: number) => {
      const before = text.slice(0, offset);
      return { line: before.split("\n").length - 1, character: offset - (before.lastIndexOf("\n") + 1) };
    };
    // A digit in a value before the declaration, a space in its header, then
    // typing its parameter and its local into `math` and `string`, which a
    // later line uses as the standard library, and a digit after it.
    const edits: [string, number, string][] = [
      ["  local v3 = 3", "  local v3 = ".length, "1"],
      ["  type function Wrap(mat)", "  type function".length, " "],
      ["Wrap(mat)", "Wrap(mat".length, "h"],
      ["    local strin = mat", "    local strin".length, "g"],
      ["  local w5 = 5", "  local w5 = ".length, "1"],
    ];
    let version = 2;
    for (const [line, column, inserted] of edits) {
      const offset = text.indexOf(line) + column;
      incremental.update({
        textDocument: { uri, version: version++ },
        contentChanges: [{ range: { start: position(offset), end: position(offset) }, text: inserted }],
      });
      text = text.slice(0, offset) + inserted + text.slice(offset);
      const cold = new SparkdownDocumentRegistry(["semantics"]);
      cold.add({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
      expect(semanticsAfterEnd(incremental), `after the edit to ${JSON.stringify(line)}`).toEqual(semanticsAfterEnd(cold));
    }
  });

  test("its parameters and locals do not shadow names in the enclosing scope", () => {
    const script = (parameter: string, local: string) => `function raise()
  type function Wrap(${parameter})
    local ${local} = ${parameter}
    return ${local}
  end
  local a = math.floor(2.5)
  local b = string.len("a")
  return a + b
end
`;
    const shadowing = script("math", "string");
    const control = script("p", "q");
    // The last occurrence of each name is its use after the type function.
    expect(annotationsOf(shadowing, "math").at(-1)).toEqual(annotationsOf(control, "math").at(-1));
    expect(annotationsOf(shadowing, "string").at(-1)).toEqual(annotationsOf(control, "string").at(-1));
  });

  test("its parameters are declared under its own name", () => {
    const [outer, inner] = annotationsOf(
      `function raise(t)
  type function F(t)
    return t
  end
  return t
end
`,
      "t",
    );
    expect((outer!["references"] as any).symbolIds).toEqual(["raise.t"]);
    expect((inner!["references"] as any).symbolIds).toEqual(["F.t"]);
  });

  test("type used as a value still reads as a call", () => {
    const { errors, recorded } = run([
      {
        uri: "inmemory:///main.sd",
        text: `external harness_record(v)
& harness_record(type(1))
done
`,
      },
    ]);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["number"]);
  });
});

// Every diagnostic a compile of one `.sd` script gives, with its range.
function scriptDiagnostics(text: string): string[] {
  const uri = "inmemory:///main.sd";
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  const program = compiler.compile({ textDocument: { uri } }).program;
  return (program.diagnostics?.[uri] ?? []).map((d) => {
    const message = typeof d.message === "string" ? d.message : d.message.value;
    return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
  });
}

// The checker binds a type function's name as a type and checks its body in
// the type function environment. Sparkdown has no VM to evaluate the function
// with, so a type that uses one reports that it cannot be evaluated, as Luau
// does without one, and reduces to `never`. Luau's own type function tests
// use `BuiltinsFixture`, whose type function environment has the `types`
// library.
describe("type function in the type checker", () => {
  const CANNOT_EVALUATE = "'F' type function: cannot be evaluated in this context";
  // These layout expectations use product source ordering, independently of
  // the fixture API's fresh checker insertion order.
  const check = (source: string) => checkLuau(source, { fixture: "BuiltinsFixture" })
    .diagnostics.slice().sort((a, b) => a.line - b.line || a.column - b.column)
    .map(describeDiagnostic);

  test("a type that uses one reports that it cannot be evaluated", () => {
    expect(
      check(`
type function F(t)
    return types.unionof(t, types.number)
end
type U = F<string>
local x: U = 1
`),
    ).toEqual([
      `4:9-4:18 UserDefinedTypeFunctionError: ${CANNOT_EVALUATE}`,
      "5:13-5:14 TypeMismatch: Expected this to be 'F<string>', but got 'number'; \nthe reduced type is `never`, and `number` is not a subtype of `never`",
    ]);
  });

  test("one that nothing uses reports nothing", () => {
    expect(
      check(`
type function F(t)
    return types.unionof(t, types.number)
end
local x: number = 1
`),
    ).toEqual([]);
  });

  // Luau's `udtf_recovery_no_upvalues`: a use of a declaration with a parse
  // error reduces to the error type and reports nothing more.
  test("one with a parse error reports only the parse error", () => {
    expect(
      check(`
local var

type function save_upvalue(arg)
    var = 1
    return arg
end

type test = "test"
local function ok(idx: save_upvalue<test>): "test"
    return idx
end
`),
    ).toEqual(["4:8-4:9 SyntaxError: Type function cannot reference outer local 'var'"]);
  });

  test("its body is checked in the type function environment", () => {
    expect(
      check(`
type function F(t)
    local n: number = "one"
    return t
end
`),
    ).toEqual(["2:22-2:27 TypeMismatch: Expected this to be 'number', but got 'string'"]);
  });

  test("its body sees the type aliases it names and the other type functions", () => {
    expect(
      check(`
type Pair = { number }
type function G(t)
    return t
end
type function F(t)
    local p = Pair
    return G(t)
end
`),
    ).toEqual([]);
  });

  test("a type alias of the same name is a duplicate", () => {
    expect(
      check(`
type F = number
type function F(t)
    return t
end
`).map((d) => d.split(" ").slice(0, 2).join(" ")),
    ).toEqual(["2:0-4:3 DuplicateTypeDefinition:"]);
  });

  // A nameless declaration is an editing state; its placeholder name is not a
  // name an author wrote, so two of them are not a duplicate.
  test("two nameless declarations are not a duplicate", () => {
    const diagnostics = check(`
type function (t)
    return t
end
type function (u)
    return u
end
`);
    expect(diagnostics.filter((d) => d.includes("DuplicateTypeDefinition"))).toEqual([]);
    expect(diagnostics.join("\n")).not.toContain("%error-id%");
  });

  test("a use inside a function reports that it cannot be evaluated once, on the use", () => {
    const diagnostics = check(`
function f()
    type function F(t)
        return t
    end
    local function g(): F<string>
        return 1
    end
    return g()
end
`);
    // The enclosing functions and the call of `g` carry the instance too, and
    // a call of `g` is not a mismatch for it.
    expect(diagnostics).toEqual([
      `5:24-5:33 UserDefinedTypeFunctionError: ${CANNOT_EVALUATE}`,
      "6:15-6:16 TypeMismatch: Expected this to be 'F<string>', but got 'number'; \nthe reduced type is `never`, and `number` is not a subtype of `never`",
    ]);
  });

  test("a script's top-level one reaches the checker", () => {
    const text = `---
typecheck: strict
---

type function F(t)
    return types.unionof(t, types.number)
end
type U = F<string>
local x: U = 1
`;
    expect(scriptDiagnostics(text)).toEqual([
      `7:9-7:18 ${CANNOT_EVALUATE}`,
      "8:13-8:14 Expected this to be 'F<string>', but got 'number'; \nthe reduced type is `never`, and `number` is not a subtype of `never`",
    ]);
  });

  test("a use nested in a larger annotation reports that it cannot be evaluated once, on the use", () => {
    expect(
      check(`
type function F(t)
    return t
end
local x: { a: F<string> } = nil :: any
local y: F<number>? = nil
`),
    ).toEqual([
      `4:14-4:23 UserDefinedTypeFunctionError: ${CANNOT_EVALUATE}`,
      `5:9-5:18 UserDefinedTypeFunctionError: ${CANNOT_EVALUATE}`,
    ]);
  });

  // Every use of the same application is one instance, and the checker
  // reports once per instance, as Luau's seen-set does, so only the first
  // use of `F<string>` reports.
  test("the same application used twice reports that it cannot be evaluated once", () => {
    expect(
      check(`
type function F(t)
    return t
end
type A = F<string>
type B = F<string>
type C = F<number>
`),
    ).toEqual([`4:9-4:18 UserDefinedTypeFunctionError: ${CANNOT_EVALUATE}`, `6:9-6:18 UserDefinedTypeFunctionError: ${CANNOT_EVALUATE}`]);
  });

  // A builtin type function's error is reported once per instance, as Luau
  // does, however many annotations and expressions carry the instance.
  test("a builtin type function that cannot be reduced reports once", () => {
    expect(
      check(`
local a: keyof<number> = nil :: any
local c: keyof<number> = a
`),
    ).toEqual(["1:9-1:22 UninhabitedTypeFunction: Type 'number' does not have keys, so 'keyof<number>' is invalid"]);
  });

  test("a use inside a script function reports that it cannot be evaluated once, on the use", () => {
    const text = `---
typecheck: strict
---

function f()
  type function F(t)
    return t
  end
  local function g(): F<string>
    return 1
  end
  return g()
end

& f()
done
`;
    expect(scriptDiagnostics(text).filter((d) => d.includes(CANNOT_EVALUATE))).toEqual([`8:22-8:31 ${CANNOT_EVALUATE}`]);
  });

  // A script is checked in non-strict mode unless it asks for strict. Luau's
  // non-strict mode does not report a type function that cannot be reduced,
  // for a builtin type function as for a user-defined one.
  test("a script in the default mode reports nothing for a use", () => {
    const text = `type function F(t)
    return t
end
type U = F<string>
local x: U = 1
`;
    expect(scriptDiagnostics(text)).toEqual([]);
  });

  test("a script's top-level one that nothing uses reports nothing", () => {
    const text = `---
typecheck: strict
---

type function F(t)
    return types.unionof(t, types.number)
end
local x: number = 1
`;
    expect(scriptDiagnostics(text)).toEqual([]);
  });
});
