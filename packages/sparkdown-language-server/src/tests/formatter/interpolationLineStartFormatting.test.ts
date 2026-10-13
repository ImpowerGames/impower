// A line that starts with an interpolation is a display line (#1746), so the
// formatter treats the text after the interpolation as that line's text: a
// `..` in the middle of the line and the spaces after it are text the player
// shows, and the line's tags keep the spacing written before them.

import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a line that starts with an interpolation", () => {
  for (const line of [
    "{x}",
    "{x} there",
    "{x}there",
    "{x} {y}",
    "{x}{y} there",
    "{x} there # t",
    "{x} # t",
    "{x}# t",
    "{x} ..   more",
    "{x}..   more",
    "{{shout}} there # t",
  ]) {
    test(`leaves ${JSON.stringify(line)} as written`, () => {
      const source = `store x = "Hi"\nstore y = "Ho"\n${line}\n`;
      expect(formatSource(source)).toBe(source);
    });
  }
});
