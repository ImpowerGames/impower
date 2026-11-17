// @vitest-environment node
import { describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";

const mask = (type: string): string =>
  (EDITOR_THEME as unknown as Record<string, { "&::after": { maskImage: string } }>)[`& .cm-completionIcon-${type}`]![
    "&::after"
  ].maskImage;

describe("the value completion icon", () => {
  it("draws the codicon symbol-value glyph, which VS Code shares with symbol-enum", () => {
    expect(mask("value")).toBe(mask("enum"));
  });
});
