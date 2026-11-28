import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

const FORMS = [
  "First >>",
  "First >> // note",
  "First >> /* note */",
  "First >> /* a */ /* b */",
  "First >> /* a */ // b",
  "First >> /* a */ more",
  "First >> # pause",
  "First >> # pause // note",
  "First >> more",
  "First>>",
  "First >>>",
  "First ..>>",
  "First .. >>",
  "Hello {name} >>",
  'She said "go >>"',
  "HERO: First >>",
  "HERO: What's plan b? <wait=0.6> >>",
  ">>",
  ">> Hello",
];

describe("formatting a line with `>>` (I-2747)", () => {
  test.each(FORMS)("leaves %j as written", (line) => {
    const source = `scene start\n  ${line}\n  Second.\nend\n`;
    expect(formatSource(source)).toBe(source);
  });

  test("leaves `>>` before a block comment left open to a later line as written", () => {
    const source = `scene start\n  First >> /* open\n  still a comment */\n  Second.\nend\n`;
    expect(formatSource(source)).toBe(source);
  });
});
