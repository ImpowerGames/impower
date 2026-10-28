import { describe, expect, test } from "vitest";
import { blendColor, formatColor, readColor } from "../../morph/color";

const rgba = (value: string) => {
  const read = readColor(value);
  return read?.kind === "color" ? read.color.map((n) => Math.round(n * 1000) / 1000) : read;
};

describe("the morph colour reader", () => {
  test("hex in 3, 4, 6 and 8 digits", () => {
    expect(rgba("#f80")).toEqual([255, 136, 0, 1]);
    expect(rgba("#F808")).toEqual([255, 136, 0, 0.533]);
    expect(rgba("#c9c9c9")).toEqual([201, 201, 201, 1]);
    expect(rgba("#11223380")).toEqual([17, 34, 51, 0.502]);
    expect(rgba("#12345")).toBeUndefined();
    expect(rgba("#ggg")).toBeUndefined();
  });

  test("rgb() and rgba(), with commas or spaces, numbers or percentages", () => {
    expect(rgba("rgb(10, 20, 30)")).toEqual([10, 20, 30, 1]);
    expect(rgba("rgba(10,20,30,0.5)")).toEqual([10, 20, 30, 0.5]);
    expect(rgba("rgb(100% 50% 0% / 25%)")).toEqual([255, 127.5, 0, 0.25]);
    expect(rgba("rgba(10 20 30)")).toEqual([10, 20, 30, 1]);
    expect(rgba("rgb(300, -5, 0)")).toEqual([255, 0, 0, 1]);
    expect(rgba("rgb(1, 2)")).toBeUndefined();
  });

  test("hsl() and hsla(), with angle units", () => {
    expect(rgba("hsl(0, 100%, 50%)")).toEqual([255, 0, 0, 1]);
    expect(rgba("hsla(120, 100%, 25%, 0.5)")).toEqual([0, 127.5, 0, 0.5]);
    expect(rgba("hsl(0.5turn 100% 50% / 1)")).toEqual([0, 255, 255, 1]);
    expect(rgba("hsl(240deg, 100%, 50%)")).toEqual([0, 0, 255, 1]);
    expect(rgba("hsl(0, 100, 50)")).toBeUndefined();
  });

  test("named colours, transparent, currentColor and none", () => {
    expect(rgba("rebeccapurple")).toEqual([102, 51, 153, 1]);
    expect(rgba("Black")).toEqual([0, 0, 0, 1]);
    expect(rgba("transparent")).toEqual([0, 0, 0, 0]);
    expect(readColor("currentColor")).toEqual({ kind: "current" });
    expect(readColor("none")).toEqual({ kind: "none" });
  });

  test("line breaks are whitespace inside a colour function", () => {
    expect(rgba("rgb(0\n0\n0)")).toEqual([0, 0, 0, 1]);
    expect(rgba("rgba(\n  10,\n  20,\n  30,\n  0.5\n)")).toEqual([10, 20, 30, 0.5]);
    expect(rgba("hsl(0\n100%\n50%)")).toEqual([255, 0, 0, 1]);
  });

  test("syntax a browser drops is unknown, not a colour", () => {
    for (const value of ["rgb(100%, 0, 0)", "rgba(255, 0%, 0, 1)", "rgb(5., 0, 0)", "hsl(0, 100%, 50.%)", "__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(readColor(value), value).toBeUndefined();
    }
  });

  test("anything else is unknown", () => {
    for (const value of ["url(#gleam)", "url(#gleam) red", "color-mix(in srgb, red, blue)", "oklch(0.5 0.1 30)", "Canvas", "", "bluish"]) {
      expect(readColor(value), value).toBeUndefined();
    }
  });

  test("blends in sRGB with premultiplied alpha", () => {
    expect(formatColor(blendColor([0, 0, 0, 1], [255, 255, 255, 1], 0.5))).toBe("rgba(128,128,128,1)");
    // A transparent end keeps the other's colour, fading only its alpha.
    expect(formatColor(blendColor([255, 0, 0, 0], [255, 0, 0, 1], 0.25))).toBe("rgba(255,0,0,0.25)");
    expect(formatColor(blendColor([0, 0, 255, 0.5], [255, 0, 0, 1], 0.5))).toBe("rgba(170,0,85,0.75)");
  });
});
