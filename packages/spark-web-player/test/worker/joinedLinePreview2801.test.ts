import { describe, expect, it } from "vitest";
import {
  createPlayerHarness,
  lettersIn,
  MAIN_URI,
  type SnapshotNode,
} from "./playerHarness";

const OWN_LAYOUT = `layout main {
  textbox {
    dialogue {
      text "Says:"
    }
  }
}
`;

const source = (line: string, declarations = "") =>
  `${declarations}store word = "First."

scene start
  Before.
  ${line}
end
`;

const previewOf = async (text: string, lineText: string) => {
  const line = text.split("\n").findIndex((l) => l.includes(lineText));
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line },
  });
  try {
    await h.compile();
    await h.select(line);
    return lettersIn(h.snapshotDOM() as SnapshotNode, "dialogue");
  } finally {
    h.dispose();
  }
};

describe("the preview of a line joined with `..` on both sides of `>` shows both parts (I-2801)", () => {
  it.each([
    ["written words", "HERO: First. .. > .. Second.", "First. Second."],
    ["interpolated words", "HERO: {word} .. > .. {word}", "First. First."],
    ["several clicks", "HERO: One .. > .. two .. > .. three.", "One two three."],
  ])("in the built-in box, with %s", async (_, line, expected) => {
    const shown = await previewOf(source(line), line);
    expect(shown.replaceAll(" ", "")).toBe(
      expected.replaceAll(" ", "").repeat(2),
    );
  }, 120_000);

  it.each([
    ["written words", "HERO: First. .. > .. Second.", "First. Second."],
    ["interpolated words", "HERO: {word} .. > .. {word}", "First. First."],
  ])("in an own layout, with %s", async (_, line, expected) => {
    const shown = await previewOf(source(line, OWN_LAYOUT), line);
    expect(shown.replaceAll(" ", "")).toBe(expected.replaceAll(" ", ""));
  }, 120_000);

  it("across two lines, the preview of the second line shows both parts", async () => {
    const text = source("HERO: First. .. >\n  .. Second.");
    const shown = await previewOf(text, ".. Second.");
    expect(shown.replaceAll(" ", "")).toBe("First.Second.".repeat(2));
  }, 120_000);
});
