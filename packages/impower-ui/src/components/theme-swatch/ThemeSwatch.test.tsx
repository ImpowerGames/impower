import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ThemeSwatch from "./ThemeSwatch";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLElement>("[data-theme-swatch]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("ThemeSwatch", () => {
  it("scopes the theme it draws, so its colors are that theme's own variables", async () => {
    const swatch = await mount(<ThemeSwatch theme="chalk" />);
    expect(swatch.dataset["theme"]).toBe("chalk");
    expect(swatch.getAttribute("aria-hidden")).toBe("true");
    expect(swatch.querySelectorAll("[data-theme]:not([data-theme='chalk'])")).toHaveLength(0);
    expect(swatch.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it("draws the paired theme on its second half and its page", async () => {
    const swatch = await mount(<ThemeSwatch theme="charcoal" pairedTheme="chalk" />);
    expect(swatch.dataset["theme"]).toBe("charcoal");
    const paired = Array.from(swatch.querySelectorAll<HTMLElement>("[data-theme='chalk']"));
    expect(paired.map((element) => element.tagName)).toEqual(["SPAN", "EM"]);
  });
});
