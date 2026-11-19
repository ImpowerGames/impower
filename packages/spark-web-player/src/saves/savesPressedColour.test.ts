import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const HOVER_MEDIA = "@media (hover: hover) and (pointer: fine)";

function fineHoverCss(): string {
  const source = readFileSync(resolve(__dirname, "saves.css"), "utf8");
  const start = source.indexOf(HOVER_MEDIA);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    if (source[end] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const unwrapped =
    source.slice(0, start) + source.slice(open + 1, end) + source.slice(end + 1);
  return unwrapped
    .replace(/:hover/g, "[data-hover]")
    .replace(/:active/g, "[data-active]");
}

function mount(markup: string): HTMLElement {
  const style = document.createElement("style");
  style.textContent = fineHoverCss();
  document.head.append(style);
  const host = document.createElement("spark-web-player");
  host.innerHTML = markup;
  document.body.append(host);
  return host;
}

function background(element: Element): string {
  return getComputedStyle(element).backgroundColor;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("saves controls under a fine hovering pointer", () => {
  it("shows the pressed colour while the Saves button is pressed", () => {
    const host = mount(`<button class="saves-button" data-hover data-active>Saves</button>`);
    expect(background(host.querySelector(".saves-button")!)).toBe(
      "var(--swp-saves-active-color)",
    );
  });

  it("keeps the hover colour while the Saves button is only hovered", () => {
    const host = mount(`<button class="saves-button" data-hover>Saves</button>`);
    expect(background(host.querySelector(".saves-button")!)).toBe(
      "var(--swp-saves-hover-color)",
    );
  });

  it("keeps the active colour on expanded controls while they are hovered", () => {
    const host = mount(
      `<button class="saves-button" aria-expanded="true" data-hover>Saves</button>` +
        `<button class="saves-more" aria-expanded="true" data-hover>More</button>`,
    );
    expect(background(host.querySelector(".saves-button")!)).toBe(
      "var(--swp-saves-active-color)",
    );
    expect(background(host.querySelector(".saves-more")!)).toBe(
      "var(--swp-saves-active-color)",
    );
  });
});
