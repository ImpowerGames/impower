// Save/restore round-trip for the display-as-Luau-call transport. A
// `display(<table>)` beat parks its live instruction ObjectValue in the output
// stream; if a checkpoint happens on that beat (gameplay saves constantly), the
// output stream — and the ObjectValue in it — must serialize and reload intact,
// or the restored beat would lose its content.
//
// Guards the follow-up the engine-wiring increment flagged: output-stream
// ObjectValue save serialization.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { ObjectValue } from "../../inkjs/engine/Value";

function compile(source: string): Record<string, any> {
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
  if (!result.program.compiled) {
    throw new Error("display serialization fixture failed to compile");
  }
  return result.program.compiled as Record<string, any>;
}

function field(obj: ObjectValue, key: string): unknown {
  return obj.value?.get(key)?.value;
}

describe("display() output-stream serialization", () => {
  test("a checkpoint on a display beat round-trips the instruction table", () => {
    const compiled = compile(`store score = 7
& display({ target = "action", text = "Hi.", value = score })
done
`);

    const storyA = new RuntimeStory(compiled);
    const errorsA: string[] = [];
    storyA.onError = (m) => errorsA.push(m);
    storyA.Continue(); // completes the display beat — table is in the output stream
    expect(errorsA).toEqual([]);
    // Sanity: the live story has the payload before saving.
    expect(storyA.currentDisplayInstructions).toHaveLength(1);

    // Checkpoint mid-beat.
    const savedJson = storyA.state.ToJson() as string;

    // Restore into a fresh story.
    const storyB = new RuntimeStory(compiled);
    const errorsB: string[] = [];
    storyB.onError = (m) => errorsB.push(m);
    storyB.state.LoadJson(savedJson);
    expect(errorsB).toEqual([]);

    // The instruction table survived the wire, structured and with live values.
    const restored = storyB.currentDisplayInstructions;
    expect(restored).toHaveLength(1);
    const table = restored[0]!;
    expect(table).toBeInstanceOf(ObjectValue);
    expect(field(table, "target")).toBe("action");
    expect(field(table, "text")).toBe("Hi.");
    expect(field(table, "value")).toBe(7);
    // And currentText stays empty after load (still no re-parse).
    expect((storyB.currentText ?? "").trim()).toBe("");
  });
});
