import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { functionSpans } from "@impower/sparkdown/src/tests/programListing";
import { describe, expect, test } from "vitest";
import {
  compileUI,
  createHarness,
  MAIN_URI,
} from "../ui/harness/uiTestHarness";

const runtimeErrors = (messages: any[]) =>
  messages
    .filter((m) => m.method === "game/runtimeError")
    .map((m) => m.params.message);

const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

const playFrom = async (
  source: string,
  line: number,
  opts?: {
    file?: string;
    scripts?: Record<string, string>;
  },
) => {
  const h = createHarness(source, line, { scripts: opts?.scripts });
  await h.ready;
  h.reset();
  const startFrom = h.game.setStartFrom(
    { file: opts?.file ?? MAIN_URI, line },
    "first",
  );
  h.game.start();
  return {
    startFile: startFrom?.file,
    startLine: startFrom?.line,
    executedLine: h.game.getLastExecutedDocumentLocation()?.range.start.line,
    errors: runtimeErrors(h.messages),
    running: h.game.state === "running",
  };
};

const previewOf = async (source: string, line: number) => {
  const h = createHarness(source, line);
  await h.ready;
  h.reset();
  const path = await h.preview(line);
  return { path, errors: runtimeErrors(h.messages), text: writtenText(h) };
};

describe("a store whose value is a function literal (#835)", () => {
  const SOURCE = [
    `store obj = setmetatable({}, { __index = function(t, k) return "found" end })`,
    ``,
    `A`,
    `B`,
    `C`,
    ``,
  ].join("\n");

  test("PLAY from its line starts at the story line after it", async () => {
    const run = await playFrom(SOURCE, 0);
    expect(run.errors).toEqual([]);
    expect(run.startLine).toBe(2);
    expect(run.executedLine).toBe(2);
    expect(run.running).toBe(true);
  });

  test("a preview of its line shows the story line after it", async () => {
    const shown = await previewOf(SOURCE, 0);
    expect(shown.errors).toEqual([]);
    expect(shown.path).not.toContain("__synth$");
    expect(shown.text).toContain("A");
  });
});

describe("a store whose value is a function literal, after the last story line (#835)", () => {
  const SOURCE = [
    `A`,
    `B`,
    ``,
    `store obj = setmetatable({}, { __index = function(t, k) return "found" end })`,
    ``,
  ].join("\n");

  test("PLAY from its line starts at the top of the story", async () => {
    const run = await playFrom(SOURCE, 3);
    expect(run.errors).toEqual([]);
    expect(run.executedLine).toBe(0);
    expect(run.running).toBe(true);
  });

  test("a preview of its line diverts nowhere", async () => {
    const shown = await previewOf(SOURCE, 3);
    expect(shown.errors).toEqual([]);
    expect(shown.path).toBeNull();
  });
});

describe("a function declaration between story lines (#835, #834)", () => {
  const SOURCE = [
    `A`,
    ``,
    `function less(a, b)`,
    `  return a < b`,
    `end`,
    ``,
    `B`,
    `C`,
    ``,
  ].join("\n");

  test.each([
    ["its header", 2],
    ["its body", 3],
    ["its end", 4],
  ])("PLAY from %s starts at the story line after it", async (_, line) => {
    const run = await playFrom(SOURCE, line);
    expect(run.errors).toEqual([]);
    expect(run.startLine).toBe(6);
    expect(run.executedLine).toBe(6);
    expect(run.running).toBe(true);
  });

  test("a preview of its header shows the story line after it", async () => {
    const shown = await previewOf(SOURCE, 2);
    expect(shown.errors).toEqual([]);
    expect(shown.text).toContain("B");
  });

  test("PLAY from a story line after its end starts on that line", async () => {
    const run = await playFrom(SOURCE, 7);
    expect(run.errors).toEqual([]);
    expect(run.executedLine).toBe(7);
    expect(run.running).toBe(true);
  });
});

describe("a function declaration before the first story line (#835, #834)", () => {
  const SOURCE = [
    `function less(a, b)`,
    `  return a < b`,
    `end`,
    ``,
    `A`,
    `B`,
    ``,
  ].join("\n");

  test("PLAY from its header starts at the first story line", async () => {
    const run = await playFrom(SOURCE, 0);
    expect(run.errors).toEqual([]);
    expect(run.executedLine).toBe(4);
    expect(run.running).toBe(true);
  });

  test("PLAY from a story line starts on that line", async () => {
    const run = await playFrom(SOURCE, 5);
    expect(run.errors).toEqual([]);
    expect(run.executedLine).toBe(5);
    expect(run.running).toBe(true);
  });
});

describe("a function declared inside a scene (#835)", () => {
  const SOURCE = [
    `scene one`,
    `  A`,
    `  function g()`,
    `    return 1`,
    `  end`,
    `  B`,
    `end`,
    ``,
  ].join("\n");

  test("PLAY from its header starts at the scene's line after it", async () => {
    const run = await playFrom(SOURCE, 2);
    expect(run.errors).toEqual([]);
    expect(run.executedLine).toBe(5);
    expect(run.running).toBe(true);
  });
});

describe("a function declaration after the last story line (#835)", () => {
  const SOURCE = [
    `A`,
    `B`,
    ``,
    `function less(a, b)`,
    `  return a < b`,
    `end`,
    ``,
  ].join("\n");

  test("PLAY from its header starts at the top of the story", async () => {
    const run = await playFrom(SOURCE, 3);
    expect(run.errors).toEqual([]);
    expect(run.executedLine).toBe(0);
    expect(run.running).toBe(true);
  });
});

describe("a function declared in another script of the project (#835)", () => {
  const OTHER_URI = "inmemory:///other.sd";
  const MAIN = [`A`, ``].join("\n");
  const OTHER = [
    `scene before`,
    `  B`,
    `end`,
    ``,
    `function less(a, b)`,
    `  return a < b`,
    `end`,
    ``,
    `scene after`,
    `  C`,
    `end`,
    ``,
  ].join("\n");

  test("records the lines of its declaration in that script", () => {
    const { program } = compileUI(MAIN, { scripts: { [OTHER_URI]: OTHER } });
    const scripts = Object.keys(program.scripts);
    expect(functionSpans(program as any)).toContainEqual({
      path: "less",
      lines: [scripts.indexOf(OTHER_URI), 4, 6],
    });
  });

  test("PLAY from its header starts at the story line after it, in that script", async () => {
    const run = await playFrom(MAIN, 4, {
      file: OTHER_URI,
      scripts: { [OTHER_URI]: OTHER },
    });
    expect(run.errors).toEqual([]);
    expect(run.startFile).toBe(OTHER_URI);
    expect(run.startLine).toBe(9);
    expect(run.running).toBe(true);
  });
});

describe("the lines of a function body still resolve for the debugger (#835)", () => {
  test("a breakpoint on a body line stays in the function", async () => {
    const SOURCE = [
      `A {less(1, 2)}`,
      `B`,
      ``,
      `function less(a, b)`,
      `  return a < b`,
      `end`,
      ``,
    ].join("\n");
    const { program } = compileUI(SOURCE);
    const locator = programLocator(program);
    const found = locator.addressAt(MAIN_URI, 4, { functions: true });
    expect(locator.sceneAt(found)).toBe("less");
    const h = createHarness(SOURCE, 0);
    await h.ready;
    const [placed] = h.game.setBreakpoints([{ file: MAIN_URI, line: 4 }]);
    expect(placed).toMatchObject({ verified: true });
  });
});
