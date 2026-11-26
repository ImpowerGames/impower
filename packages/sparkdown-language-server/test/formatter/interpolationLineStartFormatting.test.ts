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
