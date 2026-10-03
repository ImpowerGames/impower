import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";
import { dumpTree, stripAnsi } from "./grammarSnapshot";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

describe("lowerer grammar distinctions", () => {
  test("run paths distinguish quoted and unquoted content", () => {
    expect(stripAnsi(dumpTree('run "scripts/start.luau"\n'))).toContain("RunQuotedPath");
    expect(stripAnsi(dumpTree("run scripts/start\n"))).toContain("RunUnquotedPath");
    for (const source of ['run "scripts/start.luau"\n', "run 'scripts/start'\n", "run scripts/start\n"]) {
      expect(compileSource(source).find((e) => e.block?.run)?.block?.run).toBe("scripts/start");
    }
  });

  test("unquoted props distinguish whole numeric, boolean and word values", () => {
    const source = 'layout main with\n  text #gap=-1.5 #enabled=true #hidden=false #width=16px #label=trueish\nend\n';
    const tree = stripAnsi(dumpTree(source));
    expect(tree).toContain("InlinePropNumericValue");
    expect(tree).toContain("InlinePropBooleanValue");
    expect(tree).toContain("InlinePropWordValue");
    const layouts = compileSource(source).find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
    expect((layouts as any)?.main.children[0].props).toEqual({
      gap: { kind: "literal", value: -1.5 },
      enabled: { kind: "literal", value: true },
      hidden: { kind: "literal", value: false },
      width: { kind: "literal", value: "16px" },
      label: { kind: "literal", value: "trueish" },
    });
  });

  test.each([
    'run "scripts/start.luau" ',
    "run 'scripts/start.luau'\t",
    'run "scripts/start.luau"  # tag',
  ])("%s retains its quoted path with trailing whitespace", (line) => {
    expect(compileSource(`${line}\n`).find((e) => e.block?.run)?.block?.run).toBe("scripts/start");
  });

  test.each([
    "Before > .. load forest",
    "Before .. > .. load forest",
    ":\n  .. load forest",
    "Before > ..\tload forest",
    ":\n  ..\tload forest",
  ])("%s keeps a load directive after spaced glue", (line) => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(`${line}\ndone\n`);
    expect(errorMessages).toEqual([]);
    const warnings: string[] = [];
    story.onError = (message) => warnings.push(message);
    const loads: string[] = [];
    const texts: string[] = [];
    for (let i = 0; story.canContinue && i < 10; i++) {
      const text = story.Continue();
      if (text != null) texts.push(text);
      for (const instruction of story.currentDisplayInstructions) {
        const value = (instruction.value?.get("load") as any)?.value;
        if (value != null) loads.push(value);
      }
    }
    expect(loads).toEqual(["forest"]);
    expect(texts.join("")).not.toContain("load forest");
    expect(warnings).toEqual([]);
  });

  test("display load keyword is visible in the tree", () => {
    expect(stripAnsi(dumpTree("load forest\n"))).toContain("DisplayLoadKeyword");
    expect(stripAnsi(dumpTree("HERO: load forest\n"))).not.toContain("DisplayLoadKeyword");
  });

  test("break glue and named event handlers already have nodes", () => {
    expect(stripAnsi(dumpTree("A .. > .. B\n"))).toContain("LeadingGlue");
    expect(stripAnsi(dumpTree("layout main with\n  button @click=go\nend\n"))).toContain("LuauSparkleEventHandlerName");
  });

  test.each([
    "load forest",
    ": load forest",
    ".. load forest",
    ":\n  load forest",
    ":\n\n  load forest",
    ":\n  \n\n  load forest",
    ":\n  // preload the next scene\n  load forest",
  ])(
    "%s remains a load directive", (line) => {
      const { story, errorMessages } = makeRuntimeStoryFromSource(`${line}\ndone\n`);
      expect(errorMessages).toEqual([]);
      story.Continue();
      const fields = story.currentDisplayInstructions[0]?.value;
      expect((fields?.get("load") as any)?.value).toBe("forest");
      expect(fields?.has("text")).toBe(false);
    },
  );

  test("a load after a break is a directive, but dialogue and mid-line words stay text", () => {
    const { story } = makeRuntimeStoryFromSource("Before > load forest\nHERO: load forest\nWe load forest\ndone\n");
    story.Continue();
    story.Continue();
    expect((story.currentDisplayInstructions[0]?.value?.get("load") as any)?.value).toBe("forest");
    expect(story.Continue()).toBe("load forest\n");
    expect(story.Continue()).toBe("We load forest\n");
  });

  test("tags substitute only lone variables", () => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(
      'store amount = 8\nText # {amount} { amount } {amount + 1} {amount.value} {amount[1]} {fn()}\ndone\n',
    );
    expect(errorMessages).toEqual([]);
    story.Continue();
    expect(story.currentTags).toEqual(["8 8 {amount + 1} {amount.value} {amount[1]} {fn()}"]);
  });

  test("a load word without arguments remains literal text", () => {
    const { story } = makeRuntimeStoryFromSource("load \ndone\n");
    expect(story.Continue()).toBe("load\n");
    expect(story.currentDisplayInstructions[0]?.value?.has("load")).toBe(false);
  });

  test("named handlers retain reference semantics", () => {
    const source = "layout main with\n  button @click=go\nend\n";
    const layouts = compileSource(source).find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
    expect((layouts as any)?.main.children[0].events).toEqual([
      { event: "click", handler: { kind: "ref", name: "go" } },
    ]);
  });
});
