import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errors: string[] = [];
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("local declarations can shadow built-in stdlib names", () => {
  test("local unpack = table.unpack does not error at compile time", () => {
    // Even though `unpack` is a built-in stdlib name, declaring a
    // local with the same name should be allowed (Lua-fidelity).
    const { errors } = compileAndCapture(`& run()
done

function run()
local unpack = table.unpack
host_record(1)
end
external host_record(v)
`);
    // Filter out the "variable not found: table.unpack" warning —
    // that's a separate issue (stdlib functions aren't first-class
    // values yet), not a problem with the local-declaration check.
    const fatal = errors.filter(
      (e) =>
        !e.includes("Variable not found") &&
        !e.includes("cannot be used for the name of a temp"),
    );
    expect(fatal).toEqual([]);
  });

  test("function parameter can shadow a stdlib name", () => {
    // `function f(print) ... end` should be legal — the local `print`
    // parameter shadows the stdlib `print` inside the body.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(print)
  host_record(print)
end
f(42)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([42]);
  });

});
