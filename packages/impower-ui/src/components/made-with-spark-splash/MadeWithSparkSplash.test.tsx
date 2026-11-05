import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import MadeWithSparkSplash from "./MadeWithSparkSplash";
import splashSvg from "./source/made_with_spark_splash.svg?raw";

const container = document.createElement("div");

afterEach(() => {
  render(null, container);
  container.remove();
});

describe("MadeWithSparkSplash", () => {
  it("inlines the design repository's splash svg, labelled for assistive technology", () => {
    document.body.append(container);
    render(<MadeWithSparkSplash />, container);
    const splash = container.querySelector('[role="img"]')!;
    expect(splash.getAttribute("aria-label")).toBe("Made with Spark");
    const svg = splash.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe(splashSvg.match(/viewBox="([^"]+)"/)![1]);
    expect(svg.querySelectorAll("animate").length).toBe((splashSvg.match(/<animate /g) ?? []).length);
  });
});
