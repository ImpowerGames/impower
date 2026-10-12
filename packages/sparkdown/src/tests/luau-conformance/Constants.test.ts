import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndCapture(source: string): { errors: string[]; recorded: unknown[] } {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      { uri: "inmemory:///main.sd", type: "script", name: "main", ext: "sd",
        text: source, version: 1, languageId: "sparkdown" },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const errors: string[] = [];
  if (!result.program.chunks) return { errors: ["NO_COMPILED"], recorded: [] };
  const story = testStory(result.program.chunks);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => { recorded.push(v); return v; });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("stdlib constants", () => {
  test("math.pi evaluates to Math.PI", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(math.pi)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([Math.PI]);
  });

  test("math.huge evaluates to true Infinity", () => {
    // `SimpleJson.WriteFloat` serializes Infinity as the "inff"
    // string marker (JSON has no Infinity literal) and the loader
    // recovers it as a real Infinity FloatValue — so math.huge is
    // genuinely infinite end-to-end, matching Lua. (It was formerly
    // clamped to 3.4e38, a documented divergence now removed.)
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(math.huge)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([Infinity]);
  });

  test("_VERSION evaluates to 'Luau'", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(_VERSION)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Luau"]);
  });
});
