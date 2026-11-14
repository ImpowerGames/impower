import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectScrollbarSize, measureScrollbarSize, SCROLLBAR_SIZE_VARIABLE } from "./scrollbar";

const packageCss = async (classes: string[]): Promise<string> => {
  const source = readFileSync(resolve("src/style.css"), "utf8");
  const compiler = await compile(source, { base: resolve("src"), onDependency: () => {} });
  return optimize(compiler.build(classes), { minify: false }).code;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the scrollbar gutter", () => {
  it("measures the stable gutter of a thin scrollbar and leaves nothing behind", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(90);
    const before = document.body.childElementCount;
    expect(measureScrollbarSize()).toBe(10);
    expect(document.body.childElementCount).toBe(before);
  });

  it("publishes the gutter on the root and measures it again on resize, as zoom changes it", () => {
    let client = 90;
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => client);
    connectScrollbarSize();
    expect(document.documentElement.style.getPropertyValue(SCROLLBAR_SIZE_VARIABLE)).toBe("10px");
    client = 94;
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.style.getPropertyValue(SCROLLBAR_SIZE_VARIABLE)).toBe("6px");
  });

  it("gives pr-gutter-N the padding less the gutter, never below zero", async () => {
    const css = await packageCss(["pr-gutter-4"]);
    expect(css).toContain("padding-right: max(0px, calc(var(--spacing) * 4 - var(--scrollbar-size, 0px)));");
  });

  it("keeps the stable gutter on every scroller, so nothing shifts when a list grows past the fold", async () => {
    const css = readFileSync(resolve("src/style.css"), "utf8");
    expect(css).toMatch(/:where\(\.overflow-auto, \.overflow-y-auto, \.overflow-scroll, \.overflow-y-scroll\) \{\s*scrollbar-gutter: stable/);
  });
});
