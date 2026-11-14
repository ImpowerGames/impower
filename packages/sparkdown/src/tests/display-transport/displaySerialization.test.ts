import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { ObjectValue, StringValue } from "../../runtime/Value";
import {
  SCAN_CLOSE,
  SCAN_OPEN,
  readTagCode,
  tagCode,
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

describe("a save written before tag codes (#2145)", () => {
  const writtenTags = (text: string): string => {
    let out = "";
    for (let i = 0; i < text.length; ) {
      const tag = readTagCode(text, i);
      if (tag) {
        out += `<${tag.content}>`;
        i = tag.next;
      } else {
        out += text[i++];
      }
    }
    return out;
  };
  const legacy = (value: unknown): unknown =>
    typeof value === "string"
      ? writtenTags(value)
      : Array.isArray(value)
        ? value.map(legacy)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([key]) => key !== "tagCodes")
                .map(([key, item]) => [key, legacy(item)]),
            )
          : value;

  test("reads a known tag in its tables' text as the player read it then, and leaves an unknown one as text", () => {
    const compiled = compile(
      `scene start\n  A <b>word</b> <speed:0.5>here <b2>x</b2> \`<i>\`.\n  done\nend\n`,
    );
    const storyA = testStory(compiled);
    storyA.Continue();
    const current = JSON.parse(storyA.state.ToJson() as string);
    expect(current.tagCodes).toBe(true);
    const storyB = testStory(compiled);
    storyB.state.LoadJson(JSON.stringify(legacy(current)));
    const now = storyA.currentStyledText ?? "";
    expect(now).toContain(`A ${tagCode("b")}word${tagCode("/b")} ${tagCode("speed:0.5")}here`);
    expect(storyB.currentStyledText).toBe(
      now.replace(tagCode("b2"), "<b2>").replace(tagCode("/b2"), "</b2>"),
    );
    expect(storyB.currentText).toBe(storyA.currentText);
  });

  test("reads a tag written with an equals sign as the player read it then", () => {
    const compiled = compile(`scene start\n  A word.\n  done\nend\n`);
    const storyA = testStory(compiled);
    storyA.Continue();
    const saved = legacy(JSON.parse(storyA.state.ToJson() as string)) as Record<string, any>;
    const json = JSON.stringify(saved).replace("A word.", "A <speed=0.5>word.");
    const storyB = testStory(compiled);
    storyB.state.LoadJson(json);
    expect(storyB.currentStyledText?.trim()).toBe(`A ${tagCode("speed:0.5")}word.`);
  });

  test("reads a known tag in a waiting choice's styled text", () => {
    const compiled = compile(
      `scene start\n  The gate.\n  choose\n    + Go <b>far</b> now\n      Gone.\n      done\n  end\nend\n`,
    );
    const storyA = testStory(compiled);
    storyA.ContinueMaximally();
    const styled = storyA.currentChoices.map((choice) => choice.styledText);
    expect(styled[0]).toContain(tagCode("b"));
    const storyB = testStory(compiled);
    storyB.state.LoadJson(JSON.stringify(legacy(JSON.parse(storyA.state.ToJson() as string))));
    expect(storyB.currentChoices.map((choice) => choice.styledText)).toEqual(styled);
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

interface PreChangeChoiceSave {
  source: string;
  text: string;
  choices: string[];
  chosen: number;
  remaining: string[];
  save: string;
}

const PRE_CHANGE_CHOICE_SAVES: Record<string, PreChangeChoiceSave> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/choice-saves-pre-2144.json", import.meta.url)),
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

  test.each([
    ["a styled value", `store x = "first"\nscene start\n  queue\n  | A *{x}*\n    B **{x}**\n  | Other.\n  end\n  Next.\n  done\nend\n`],
    ["a plain value", `store x = "first"\nscene start\n  queue\n  | A {x}\n    {x} B\n  | Other.\n  end\n  Next.\n  done\nend\n`],
  ])("a save made now inside an alternator's arm with %s resumes inside the arm", (_name, source) => {
    const compiled = compile(source);
    const story = testStory(compiled);
    story.keepBeatImages = true;
    story.Continue();
    const text = story.currentText;
    const save = story.toSave();
    const remaining: string[] = [];
    while (story.canContinue) {
      story.Continue();
      remaining.push(story.currentText ?? "");
    }
    const loaded = testStory(compiled);
    loaded.loadSave(save);
    expect(loaded.currentText).toBe(text);
    const after: string[] = [];
    while (loaded.canContinue) {
      loaded.Continue();
      after.push(loaded.currentText ?? "");
    }
    expect(after).toEqual(remaining);
    expect(remaining).toHaveLength(3);
  });

  test("a save taken just after a value's scan code resumes after it, not before", () => {
    const compiled = compile(
      `scene start\n  A *{queue | "literal" | "literal" end}* B \`\`raw \`x\` y\`\`.\n  done\nend\n`,
    );
    const story = testStory(compiled);
    const scanOpened = () =>
      story.state.outputStream.some(
        (obj) => obj instanceof StringValue && (obj.value ?? "").includes(SCAN_OPEN),
      );
    for (let guard = 0; !scanOpened() && guard < 1000; guard++) story.Step();
    expect(scanOpened()).toBe(true);
    const save = story.saveOfImage(story.capture())!;
    const anchors = JSON.stringify(JSON.parse(save).beats).match(/\[\d+,"[0-9a-f]{16}",\d+\]/g);
    expect(anchors?.length).toBeGreaterThan(0);
    const loaded = testStory(compiled);
    loaded.loadSave(save);
    expect(loaded.currentStyledText).toBe(story.currentStyledText);
    for (let guard = 0; story.canContinue && guard < 1000; guard++) {
      story.Step();
      loaded.Step();
    }
    expect(loaded.canContinue).toBe(false);
    expect(loaded.currentStyledText).toBe(story.currentStyledText);
    const styled = loaded.currentStyledText ?? "";
    expect(styled.split(SCAN_OPEN).length).toBe(styled.split(SCAN_CLOSE).length);
  });

  test.each(Object.entries(PRE_CHANGE_CHOICE_SAVES))(
    "a save made before choice style codes with %s on screen offers the same choices and continues as it did",
    (_name, { source, text, choices, chosen, remaining, save }) => {
      const story = testStory(compile(source));
      const errors: string[] = [];
      story.onError = (m) => errors.push(m);
      story.loadSave(save);
      while (story.canContinue) story.Continue();
      expect(story.currentText).toBe(text);
      expect(story.currentChoices.map((choice) => choice.text)).toEqual(choices);
      expect(
        story.currentChoices.map((choice) => writtenText(choice.styledText)),
      ).toEqual(choices);
      story.ChooseChoiceIndex(chosen);
      const after: string[] = [];
      while (story.canContinue) {
        story.Continue();
        after.push(story.currentText ?? "");
      }
      expect(after).toEqual(remaining);
      expect(errors).toEqual([]);
    },
  );

  test("a save made now with a styled choice on screen keeps the choice's styling", () => {
    const compiled = compile(
      `scene start\n  The gate.\n  choose\n    + *Go* [**now**] there\n      Gone.\n      done\n  end\nend\n`,
    );
    const story = testStory(compiled);
    story.keepBeatImages = true;
    story.ContinueMaximally();
    const styled = story.currentChoices.map((choice) => choice.styledText);
    expect(styled[0]).not.toBe(story.currentChoices[0]!.text);
    const loaded = testStory(compiled);
    loaded.loadSave(story.toSave());
    while (loaded.canContinue) loaded.Continue();
    expect(loaded.currentChoices.map((choice) => choice.styledText)).toEqual(styled);
    expect(loaded.currentChoices.map((choice) => choice.text)).toEqual(["*Go* **now**"]);
  });

  test("migrating its output leaves the script's own table as the script wrote it", () => {
    const { source, save } = PRE_CHANGE_SAVES["tableAlias"]!;
    const story = testStory(compile(source));
    story.loadSave(save);
    expect(story.currentStyledText?.trim()).toBe(`${SCAN_OPEN}*word*${SCAN_CLOSE}`);
    const payload = story.state.variablesState.GetVariableWithName("payload") as ObjectValue;
    expect(field(payload, "text")).toBe("*word*");
  });
});
