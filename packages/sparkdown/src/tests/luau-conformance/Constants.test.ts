import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndCapture(source: string): { errors: string[]; recorded: unknown[] } {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: "inmemory:///main.sd", type: "script", name: "main", ext: "sd",
        text: source, version: 1, languageId: "sparkdown" },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const errors: string[] = [];
  if (!result.program.compiled) return { errors: ["NO_COMPILED"], recorded: [] };
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
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

  test("math.huge evaluates to a very large number", () => {
    // Inkjs's `SimpleJson.WriteFloat` clamps Infinity to `3.4e38`
    // (Float32 max) because JSON has no Infinity literal — that's
    // an upstream inkjs constraint. Sparkdown's `math.huge` is
    // effectively `3.4e38` end-to-end. Documented divergence.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(math.huge)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3.4e38]);
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
