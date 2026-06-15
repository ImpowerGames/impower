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

describe("nested-function siblings capture each other as upvalues", () => {
  test("function checkmessage() calls function doit() declared earlier in the same scope", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function doit(s)
  return s + 1
end
function checkmessage(prog)
  return doit(prog)
end
host_record(checkmessage(41))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([42]);
  });

  // Note: forward references — `function A() B() end function B() end`
  // — are a known divergence. Sparkdown's closure-upval mechanism
  // resolves the captured pointer's contextIndex at definition time,
  // not at call time, so `B` must be declared BEFORE `A` for the
  // upval to point at a real slot. Lua handles this via late binding;
  // we'd need to hoist nested-function locals to match.

  test("external declarations are NOT wrongly captured as upvals", () => {
    // `host_record` is declared as `external …` at the document
    // top level. The closure-capture pre-scan registers it in
    // `globalCallableNames`, so the inner `function inner()` does
    // NOT try to capture `host_record` as a closure upval (which
    // would fail to resolve at runtime since host_record isn't a
    // sparkdown variable).
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function inner()
  host_record(99)
end
inner()
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99]);
  });

  test("stdlib calls inside nested function bodies stay routed to stdlib", () => {
    // Grammar tags stdlib calls as `LuauStdLibFunctions`, not
    // `LuauFunctionCall`. The scanner only walks `LuauFunctionCall`
    // for the new call-site capture, so stdlib refs are untouched.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function inner(s)
  return tostring(s)
end
host_record(inner(42))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["42"]);
  });
});
