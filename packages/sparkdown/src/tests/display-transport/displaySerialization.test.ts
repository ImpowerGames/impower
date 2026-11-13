import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { ObjectValue } from "../../runtime/Value";
import {
  SCAN_CLOSE,
  SCAN_OPEN,
  writtenText,
} from "../../runtime/displayStyle";
import { styleRuns } from "./styleRuns";
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
    expect(writtenText(String(field(table, "text")))).toBe("Hi.");
    expect(field(table, "value")).toBe(7);
    expect((storyB.currentText ?? "").trim()).toBe("Hi.");
  });

  test("a save written before style codes reads its tables' text as values, whose marks the player scans", () => {
    const compiled = compile(`scene start\n  A *word* here.\n  B *two* there.\n  done\nend\n`);
    const storyA = testStory(compiled);
    storyA.Continue();
    const current = JSON.parse(storyA.state.ToJson() as string);
    expect(current.styleCodes).toBe(true);

    const legacy = (value: unknown): unknown =>
      typeof value === "string"
        ? writtenText(value)
        : Array.isArray(value)
          ? value.map(legacy)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.entries(value)
                  .filter(([key]) => key !== "styleCodes")
                  .map(([key, item]) => [key, legacy(item)]),
              )
            : value;

    const storyB = testStory(compiled);
    storyB.state.LoadJson(JSON.stringify(legacy(current)));
    expect(storyB.currentStyledText?.trim()).toBe(
      `${SCAN_OPEN}A *word* here.${SCAN_CLOSE}`,
    );
    expect((storyB.currentText ?? "").trim()).toBe("A *word* here.");

    const storyC = testStory(compiled);
    storyC.state.LoadJson(storyA.state.ToJson() as string);
    expect(storyC.currentStyledText).toBe(storyA.currentStyledText);

    storyB.Continue();
    expect(storyB.currentText?.trim()).toBe("B *two* there.");
    expect(styleRuns(storyB.currentStyledText?.trim() ?? "")).toEqual([
      { text: "B " },
      { text: "two", marks: ["*"] },
      { text: " there." },
    ]);
  });
});

interface PreChangeSave {
  source: string;
  text: string;
  remaining: string[];
  save: string;
}

const PRE_CHANGE_SAVES: Record<string, PreChangeSave> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/display-saves-pre-2143.json", import.meta.url)),
    "utf8",
  ),
);

describe("a save made before style codes, by the runtime of that time", () => {
  test.each(Object.entries(PRE_CHANGE_SAVES))(
    "%s loads on its beat and continues as it did",
    (_name, { source, text, remaining, save }) => {
      const story = testStory(compile(source));
      const errors: string[] = [];
      story.onError = (m) => errors.push(m);
      story.loadSave(save);
      expect(story.currentText).toBe(text);
      const after: string[] = [];
      while (story.canContinue) {
        story.Continue();
        after.push(story.currentText ?? "");
      }
      expect(after).toEqual(remaining);
      expect(errors).toEqual([]);
    },
  );

  test("migrating its output leaves the script's own table as the script wrote it", () => {
    const { source, save } = PRE_CHANGE_SAVES["tableAlias"]!;
    const story = testStory(compile(source));
    story.loadSave(save);
    expect(story.currentStyledText?.trim()).toBe(`${SCAN_OPEN}*word*${SCAN_CLOSE}`);
    const payload = story.state.variablesState.GetVariableWithName("payload") as ObjectValue;
    expect(field(payload, "text")).toBe("*word*");
  });
});
