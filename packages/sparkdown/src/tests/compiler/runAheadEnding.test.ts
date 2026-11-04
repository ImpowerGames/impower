import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { runAhead, showsBeatAhead } from "../../compiler/utils/planRoute";

const URI = "inmemory:///main.sd";

const storyAt = (text: string, line: number) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const root = compiler.compile({ textDocument: { uri: URI } }).program.chunks!;
  const story = testStory(root);
  const address = root.addressAt(URI, line);
  expect(address).toBeDefined();
  story.ChooseAddress(address!);
  return { story, root };
};

const lineOf = (root: { locationOf(a: number): { startLine: number } | undefined }, at: number | null) =>
  at == null ? null : (root.locationOf(at)?.startLine ?? null);

describe("running ahead from a line answers how the run ends", () => {
  test("a run that displays a beat", () => {
    const { story } = storyAt("scene start\n  Hello.\n  done\nend\n", 1);
    expect(runAhead(story)).toEqual({ kind: "beat" });
  });

  test("a done with nothing left runs out at the done", () => {
    const { story, root } = storyAt("scene start\n  Hello.\n  done\nend\n", 2);
    const ahead = runAhead(story);
    expect(ahead.kind).toBe("out");
    expect(lineOf(root, (ahead as { at: number | null }).at)).toBe(2);
  });

  test("a fin ends with fin at the fin", () => {
    const { story, root } = storyAt("scene start\n  Hello.\n  fin\n  Never.\nend\n", 2);
    const ahead = runAhead(story);
    expect(ahead.kind).toBe("fin");
    expect(lineOf(root, (ahead as { at: number | null }).at)).toBe(2);
  });

  test("a line that raises a runtime error stops by the error, with its message and line", () => {
    const { story, root } = storyAt(
      'scene start\n  Hello.\n  & error("boom")\n  Goodbye.\nend\n',
      2,
    );
    const ahead = runAhead(story);
    expect(ahead.kind).toBe("error");
    const error = ahead as { message: string; at: number | null };
    expect(error.message).toContain("boom");
    expect(lineOf(root, error.at)).toBe(2);
    expect(showsBeatAhead(storyAt('scene start\n  & error("boom")\n  Goodbye.\nend\n', 1).story)).toBe(false);
  });

  test("a done reached with choices on screen is not an ending", () => {
    const { story } = storyAt(
      "scene start\n  choose\n    + [Yes]\n      Yes.\n  end\nend\n",
      1,
    );
    expect(runAhead(story)).toEqual({ kind: "beat" });
  });

  test("a run the step limit cuts off is not known", () => {
    const { story } = storyAt(
      "scene start\n  Hello.\n  -> spin\nend\n\nscene spin\n  -> spin\nend\n",
      2,
    );
    expect(runAhead(story, 50)).toEqual({ kind: "unknown" });
    expect(story.stepLimit).toBeNull();
  });
});
