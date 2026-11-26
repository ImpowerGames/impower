import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatter · empty block signature", () => {
  test("an empty function without a return type compacts", () => {
    expect(formatSource("function f()\n\nend\n")).toBe("function f() end\n");
  });

  test("an empty function with a return type compacts", () => {
    expect(formatSource("function f(): number\n\nend\n")).toBe(
      "function f(): number end\n",
    );
  });

  test("a function with a body is left alone", () => {
    expect(formatSource("function f(): number\n  return 1\nend\n")).toBe(
      "function f(): number\n  return 1\nend\n",
    );
  });
});
