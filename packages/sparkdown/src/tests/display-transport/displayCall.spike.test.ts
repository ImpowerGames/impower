import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { ObjectValue } from "../../runtime/Value";

function compile(source: string) {
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
    throw new Error("spike fixture failed to compile");
  }
  const story = testStory(result.program.chunks);
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  return { story, errors };
}

function field(obj: ObjectValue, key: string): unknown {
  return (obj.value?.get(key) as { value?: unknown } | undefined)?.value;
}

describe("SPIKE: display() Luau-call transport", () => {
  test("a display({...}) call carries a structured table, not text", () => {
    const { story, errors } = compile(`scene start
  & display({ kind = "text", body = "Hi." })
  done
end
`);
    story.Continue();
    expect(errors).toEqual([]);

    expect((story.currentText ?? "").trim()).toBe("");

    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    const table = instructions[0]!;
    expect(table).toBeInstanceOf(ObjectValue);
    expect(field(table, "kind")).toBe("text");
    expect(field(table, "body")).toBe("Hi.");
  });

  test("{interp} holes are evaluated to LIVE values at call time", () => {
    const { story, errors } = compile(`store score = 5
scene start
  & display({ kind = "text", value = score })
  done
end
`);
    story.Continue();
    expect(errors).toEqual([]);

    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "value")).toBe(5);
  });

  test("the beat closes (Continue completes) at the display call", () => {
    const { story, errors } = compile(`scene start
  & display({ body = "first" })
  & display({ body = "second" })
  done
end
`);
    story.Continue();
    expect(errors).toEqual([]);
    const first = story.currentDisplayInstructions;
    expect(first).toHaveLength(1);
    expect(field(first[0]!, "body")).toBe("first");

    expect(story.canContinue).toBe(true);
    story.Continue();
    const second = story.currentDisplayInstructions;
    expect(second).toHaveLength(1);
    expect(field(second[0]!, "body")).toBe("second");
  });
});
