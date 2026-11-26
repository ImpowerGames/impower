import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

function mount(markup: string): HTMLElement {
  const source = readFileSync(resolve(__dirname, "../src/spark-web-player.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = source.replace(/:focus-visible/g, "[data-focus-visible]");
  document.head.append(style);
  const host = document.createElement("spark-web-player");
  host.innerHTML = markup;
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("player bar buttons focused from the keyboard", () => {
  it.each([
    `<button id="run-button" class="toolbar-button transport-button">Run</button>`,
    `<button id="replay-beat-button" class="toolbar-button transport-button">Replay</button>`,
    `<button id="fullscreen-button" class="toolbar-button">Fullscreen</button>`,
    `<button class="route-button">Route</button>`,
    `<button class="saves-button">Saves</button>`,
  ])("draws an inset focus outline on %s", (markup) => {
    const host = mount(markup);
    const button = host.querySelector("button")!;
    button.setAttribute("data-focus-visible", "");
    const style = getComputedStyle(button);
    expect(style.outline).toBe("2px solid var(--swp-focus-color)");
    expect(style.outlineOffset).toBe("-2px");
  });

  it("keeps other focused elements without an outline", () => {
    const host = mount(`<div tabindex="0">Game</div>`);
    const element = host.querySelector("div")!;
    element.setAttribute("data-focus-visible", "");
    expect(getComputedStyle(element).outline).toBe("none");
  });
});
