import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = testCompiler();
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
  if (!result.program.chunks) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = testStory(result.program.chunks);
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

  test("external declarations are NOT wrongly captured as upvals", () => {
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
