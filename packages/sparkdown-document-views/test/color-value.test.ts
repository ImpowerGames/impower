import {
  colorPresentationFor,
  colorValueOf,
  formatColorValue,
  lspColorOf,
  opacityOf,
  storyColors,
  withColorOf,
  withOpacity,
} from "@impower/codemirror-vscode-lsp-client/src";
import { describe, expect, it } from "vitest";

describe("reading a color value", () => {
  it("expands the short forms to six or eight digits", () => {
    expect(colorValueOf("#abc")).toEqual({ rgb: "#aabbcc", alpha: "" });
    expect(colorValueOf("#abc8")).toEqual({ rgb: "#aabbcc", alpha: "88" });
  });

  it("keeps the long forms and lower-cases them", () => {
    expect(colorValueOf("#FF8800")).toEqual({ rgb: "#ff8800", alpha: "" });
    expect(colorValueOf("#ff880080")).toEqual({ rgb: "#ff8800", alpha: "80" });
  });

  it("accepts a value written without its hash and around spaces", () => {
    expect(colorValueOf("  ff8800 ")).toEqual({ rgb: "#ff8800", alpha: "" });
  });

  it("refuses a name, a function and a wrong digit count", () => {
    expect(colorValueOf("blue")).toBeNull();
    expect(colorValueOf("rgb(0 0 0)")).toBeNull();
    expect(colorValueOf("#abcde")).toBeNull();
    expect(colorValueOf("#ggg")).toBeNull();
    expect(colorValueOf("")).toBeNull();
  });
});

describe("writing a color value in the script's form", () => {
  it("writes the short form back where the script wrote one and the digits pair up", () => {
    expect(formatColorValue({ rgb: "#aabbcc", alpha: "" }, "#123")).toBe("#abc");
    expect(formatColorValue({ rgb: "#aabbcc", alpha: "88" }, "#123")).toBe("#abc8");
  });

  it("writes the long form where the digits do not pair up", () => {
    expect(formatColorValue({ rgb: "#ff8801", alpha: "" }, "#123")).toBe("#ff8801");
    expect(formatColorValue({ rgb: "#aabbcc", alpha: "80" }, "#123")).toBe("#aabbcc80");
  });

  it("keeps the script's upper case", () => {
    expect(formatColorValue({ rgb: "#ff8800", alpha: "80" }, "#FFAA00")).toBe("#FF880080");
  });

  it("writes the long form where the script wrote one", () => {
    expect(formatColorValue({ rgb: "#aabbcc", alpha: "" }, "#ff8800")).toBe("#aabbcc");
  });
});

describe("the opacity", () => {
  it("reads 100% with no alpha digits and rounds the rest to a whole percent", () => {
    expect(opacityOf({ rgb: "#ff8800", alpha: "" })).toBe(100);
    expect(opacityOf({ rgb: "#ff8800", alpha: "80" })).toBe(50);
    expect(opacityOf({ rgb: "#ff8800", alpha: "00" })).toBe(0);
  });

  it("writes the alpha digits and leaves the color", () => {
    expect(withOpacity({ rgb: "#ff8800", alpha: "" }, 50)).toEqual({
      rgb: "#ff8800",
      alpha: "80",
    });
    expect(withOpacity({ rgb: "#ff8800", alpha: "80" }, 0)).toEqual({
      rgb: "#ff8800",
      alpha: "00",
    });
  });

  it("drops the alpha digits at 100%", () => {
    expect(withOpacity({ rgb: "#ff8800", alpha: "80" }, 100)).toEqual({
      rgb: "#ff8800",
      alpha: "",
    });
  });

  it("is kept when another color is chosen", () => {
    expect(withColorOf({ rgb: "#ff8800", alpha: "80" }, "#00AAFF")).toEqual({
      rgb: "#00aaff",
      alpha: "80",
    });
    expect(withColorOf({ rgb: "#ff8800", alpha: "" }, "#0af")).toEqual({
      rgb: "#00aaff",
      alpha: "",
    });
  });
});

describe("the language server's color", () => {
  it("carries the color and the alpha as fractions", () => {
    expect(lspColorOf({ rgb: "#ff0000", alpha: "80" })).toEqual({
      red: 1,
      green: 0,
      blue: 0,
      alpha: 128 / 255,
    });
    expect(lspColorOf({ rgb: "#000000", alpha: "" }).alpha).toBe(1);
  });
});

describe("choosing the server's presentation", () => {
  const presentations = [
    { label: "#aabbcc80" },
    { label: "#AABBCC80" },
    { label: "rgb(170 187 204 / 50%)" },
    { label: "rgba(170, 187, 204, 0.502)" },
  ];

  it("keeps the short form the script wrote", () => {
    expect(
      colorPresentationFor([{ label: "#aabbcc" }, { label: "#AABBCC" }], "#123"),
    ).toBe("#abc");
  });

  it("keeps the long form and the case the script wrote", () => {
    expect(colorPresentationFor(presentations, "#ff8800")).toBe("#aabbcc80");
    expect(colorPresentationFor(presentations, "#FF8800")).toBe("#AABBCC80");
  });

  it("keeps a function form the script wrote", () => {
    expect(colorPresentationFor(presentations, "rgb(1 2 3)")).toBe(
      "rgb(170 187 204 / 50%)",
    );
  });

  it("offers nothing where the server offers nothing", () => {
    expect(colorPresentationFor([], "#ff8800")).toBeNull();
  });
});

describe("the story's colors", () => {
  it("lists each color once, in the order the story first uses it, without its opacity", () => {
    expect(
      storyColors([
        [
          { red: 1, green: 0, blue: 0, alpha: 1 },
          { red: 0, green: 0, blue: 1, alpha: 0.5 },
        ],
        [
          { red: 0, green: 0, blue: 1, alpha: 1 },
          { red: 1, green: 1, blue: 1, alpha: 1 },
          { red: 1, green: 0, blue: 0, alpha: 0.2 },
        ],
      ]),
    ).toEqual(["#ff0000", "#0000ff", "#ffffff"]);
  });
});
