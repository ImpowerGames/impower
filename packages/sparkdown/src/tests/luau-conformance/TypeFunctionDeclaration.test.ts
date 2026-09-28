// A Luau user-defined type function, `type function F(t) ... end`, is one
// declaration: its body belongs to it, its `end` closes it, and the code
// after it stays in the enclosing function. A type function runs only while
// types are checked, so the compiled story contains nothing for it.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { checkLuau } from "./typecheckTestHarness";

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
  const compiler = new SparkdownCompiler();
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
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
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
    ["a nested block",`type function F(t)\n    if t:is("number") then\n        return t\n    end\n    return t\nend\nlocal x = 1\n`],
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

  test("its parameters are not visible after its end", () => {
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
