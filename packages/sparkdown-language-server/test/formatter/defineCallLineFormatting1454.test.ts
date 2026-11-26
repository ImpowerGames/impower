import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatter · a define's call lines (I-1454)", () => {
  test("two call lines stay two lines", () => {
    const text = 'define X with\n  print("x")\n  print("y")\nend\nHello.\n';
    expect(formatSource(text)).toBe(text);
  });

  test("a call line after a method stays its own line", () => {
    const text = 'define X with\n  f()\n    x = 1\n  end\n  print("x")\n  y = 2\nend\n';
    expect(formatSource(text)).toBe(text);
  });

  test("a call line before a property stays its own line", () => {
    const text = 'define X with\n  name = "Orion"\n  print("x")\n  t.a = 1\nend\n';
    expect(formatSource(text)).toBe(text);
  });

  test("a call whose arguments go on at the next line keeps the lines after it", () => {
    const formatted = formatSource("define X with\n  print(1,\n    2)\n  y = 2\nend\n");
    expect(formatted.startsWith("define X with\n  print(1,\n"), formatted).toBe(true);
    expect(formatted.endsWith("\n  y = 2\nend\n"), formatted).toBe(true);
  });

  test("an empty method compacts onto one line", () => {
    expect(formatSource("define X with\n  f()\n\n  end\nend\n")).toBe("define X with\n  f() end\nend\n");
    expect(formatSource("define X with\n  f()\n  end\nend\n")).toBe("define X with\n  f() end\nend\n");
  });
});
