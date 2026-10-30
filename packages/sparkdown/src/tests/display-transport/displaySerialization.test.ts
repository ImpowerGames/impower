import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { ObjectValue } from "../../runtime/Value";
import type { ProgramRoot } from "../../program/ProgramRoot";

function compile(source: string): ProgramRoot {
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
  if (!result.program.chunks) {
    throw new Error("display serialization fixture failed to compile");
  }
  return result.program.chunks;
}

function field(obj: ObjectValue, key: string): unknown {
  return (obj.value?.get(key) as { value?: unknown } | undefined)?.value;
}

describe("display() output-stream serialization", () => {
  test("a checkpoint on a display beat round-trips the instruction table", () => {
    const compiled = compile(`store score = 7
scene start
  & display({ target = "action", text = "Hi.", value = score })
  done
end
`);

    const storyA = testStory(compiled);
    const errorsA: string[] = [];
    storyA.onError = (m) => errorsA.push(m);
    storyA.Continue();
    expect(errorsA).toEqual([]);
    expect(storyA.currentDisplayInstructions).toHaveLength(1);

    const savedJson = storyA.state.ToJson() as string;

    const storyB = testStory(compiled);
    const errorsB: string[] = [];
    storyB.onError = (m) => errorsB.push(m);
    storyB.state.LoadJson(savedJson);
    expect(errorsB).toEqual([]);

    const restored = storyB.currentDisplayInstructions;
    expect(restored).toHaveLength(1);
    const table = restored[0]!;
    expect(table).toBeInstanceOf(ObjectValue);
    expect(field(table, "target")).toBe("action");
    expect(field(table, "text")).toBe("Hi.");
    expect(field(table, "value")).toBe(7);
    expect((storyB.currentText ?? "").trim()).toBe("Hi.");
  });
});
