import { render as preactRender, type ComponentChild } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import SparkLogo, { MadeWithSparkSplash } from "./SparkLogo";

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const container of mounted.splice(0)) {
    preactRender(null, container);
    container.remove();
  }
});

const render = (node: ComponentChild) => {
  const container = document.createElement("div");
  document.body.append(container);
  mounted.push(container);
  preactRender(node, container);
  const getByRole = (role: string) => container.querySelector(`[role="${role}"]`)!;
  return { container, getByRole };
};

const parts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-logo-part]")).map((el) => el.getAttribute("data-logo-part"));

describe("SparkLogo", () => {
  it("draws the flame and the wordmark in the lockup, labelled as the product", () => {
    const { getByRole, container } = render(<SparkLogo />);
    expect(getByRole("img").getAttribute("aria-label")).toBe("Spark Engine");
    expect(parts(container)).toEqual(["mark", "wordmark"]);
  });

  it("draws only the flame for the mark and only the strokes for the wordmark", () => {
    expect(parts(render(<SparkLogo layout="mark" />).container)).toEqual(["mark"]);
    expect(parts(render(<SparkLogo layout="wordmark" />).container)).toEqual(["wordmark"]);
  });

  it("fills the flame in the accent with the eyes cut out and strokes the wordmark in the ink", () => {
    const { container } = render(<SparkLogo />);
    const mark = container.querySelector('[data-logo-part="mark"]')!;
    expect(mark.getAttribute("class")).toContain("text-accent");
    expect(mark.querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    expect(mark.querySelector("path")!.getAttribute("fill-rule")).toBe("evenodd");
    expect(mark.querySelector("path")!.getAttribute("d")!.match(/Z/g)).toHaveLength(3);
    const wordmark = container.querySelector('[data-logo-part="wordmark"]')!;
    expect(wordmark.getAttribute("class")).toContain("text-ink");
    expect(Array.from(wordmark.querySelectorAll("g[stroke]")).map((g) => g.getAttribute("stroke"))).toEqual([
      "currentColor",
      "currentColor",
    ]);
  });

  it("renders the Made with Spark splash as an inline svg", () => {
    const { getByRole } = render(<MadeWithSparkSplash />);
    const splash = getByRole("img");
    expect(splash.getAttribute("aria-label")).toBe("Made with Spark");
    expect(splash.querySelector("svg")).not.toBeNull();
  });
});
