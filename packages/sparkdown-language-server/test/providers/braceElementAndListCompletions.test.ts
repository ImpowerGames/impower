import { describe, expect, test } from "vitest";
import { accept, completeAt } from "./braceCompletionHarness";
import { compileProject } from "./completionHarness";

const animationProgram = {
  context: { animation: {
    $default: { $type: "animation", $name: "$default", keyframes: [{ offset: 0, opacity: 1 }] },
    $schema: { keyframes: [{ easing: ["ease", "linear"] }] },
  } },
} as any;

test.each([
  "keyframes { { off| } }",
  "keyframes { { opacity = 1; off| } }",
  "keyframes {\n{\noff|\n}\n}",
])("anonymous list item completes and replaces only its property: %s", body => {
  const source = `animation fade {\n${body}\n}\n`;
  const item = completeAt(source, animationProgram).find(i => i.label === "offset");
  expect(item).toBeDefined();
  const result = accept(source, item!);
  expect(result.replaced).toBe("off");
  expect(result.text).toBe(source.replace("off|", "offset = "));
});

test("anonymous list item completes values from its array schema", () => {
  const source = "animation fade {\nkeyframes { { easing = | } }\n}\n";
  const items = completeAt(source, animationProgram);
  expect(items.map(i => i.label)).toEqual(expect.arrayContaining(['"ease"', '"linear"']));
  const result = accept(source, items.find(i => i.label === '"linear"')!);
  expect(result.replaced).toBe("");
  expect(result.text).toBe(source.replace("|", "linear"));
});

const elementProgram = compileProject(
  `layout parts {\n  row { text "x" }\n}\n\nscene start\nend\n`,
);

describe.each(["layout", "component"])("%s independent element completions", keyword => {

  test.each([
    "ro|", "text ro|", 'text "x" ro|', "text 'x' ro|",
    "text.label ro|", "row { text ro| }", 'row { text "x" ro| }',
    "text #label='a;b' ro|", "text @click={ go() } ro|",
    "row { text } ro|",
  ])("each grammar element owns its completion: %s", body => {
    const source = `${keyword} hud {\n${body}\n}\n`;
    const item = completeAt(source, elementProgram).find(i => i.label === "row");
    expect(item).toBeDefined();
    const result = accept(source, item!);
    expect(result.replaced).toBe("ro");
    expect(result.text).toBe(source.replace("ro|", "row"));
  });
});
