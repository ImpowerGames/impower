import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compileScript, errorsOf } from "../program/programHarness";

const readme = readFileSync(
  new URL("../../inkjs/README.md", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

const sectionStart = readme.indexOf("### 6.");
const sectionEnd = readme.indexOf("### 8.");
const section = readme.slice(sectionStart, sectionEnd);
const blocks = [...section.matchAll(/```\n([\s\S]*?)```/g)].map(
  (match) => match[1]!,
);

describe("the define examples in sections 6 and 7 of the inkjs README", () => {
  test("are found", () => {
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    expect(blocks.length).toBe(3);
  });

  test.each(blocks.map((block, index) => [index, block] as const))(
    "example %i compiles without errors",
    (_index, block) => {
      expect(block).toMatch(/^define /m);
      const { program } = compileScript(
        `${block}\nscene start\n  Hi.\nend\n`,
      );
      expect(errorsOf(program)).toEqual([]);
    },
  );
});
