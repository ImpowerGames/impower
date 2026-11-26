import { describe, expect, test } from "vitest";
import { getComponents, parseSparkle, renderCssVDOM, type VNode } from "../../../../sparkle-screen-renderer/src";
import { createScreenRenderContext } from "../../../../sparkle-screen-preview/src/utils/createScreenRenderContext";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const variable = (out: string, name: string): string | undefined =>
  out.match(new RegExp(`--theme-animation-${name}:\\s*([^;]*);`))?.[1]?.trim();

const text = (node: VNode): string => (typeof node === "string" ? node : node.children.map(text).join("\n"));

const screen = (src: string, name: string) => {
  const parsed = parseSparkle(src);
  return variable(text(renderCssVDOM(parsed, createScreenRenderContext(getComponents(parsed), {}, new Set()))), name);
};

const player = async (src: string, name: string) => {
  const h = createDOMHarness(`${src}style box {\n  animation = ${name}\n}\nlayout main {\n  box\n}\n`, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return variable([...h.overlay.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n"), name);
};

const CASES: { name: string; screen: string; player: string; expected: string }[] = [
  {
    name: "pop",
    screen: "animation pop\n  timing\n    duration = 0.6\n    fill = auto\n  keyframes\n    from\n      opacity = 0\n    to\n      opacity = 1\n",
    player: `animation pop {\n  keyframes {\n    from { opacity = "0" }\n    to { opacity = "1" }\n  }\n  timing {\n    duration = 0.6\n    fill = auto\n  }\n}\n`,
    expected: "0.6s ease 0s 1 normal none running pop",
  },
  {
    name: "forwards",
    screen: "animation forwards\n  timing\n    duration = 0.6s\n",
    player: `animation forwards {\n  keyframes {\n    to { opacity = "1" }\n  }\n  timing {\n    duration = 0.6s\n  }\n}\n`,
    expected: "0.6s ease 0s 1 normal both running forwards",
  },
  {
    name: "both",
    screen: "animation both\n  timing\n    easing = ease-out\n",
    player: `animation both {\n  keyframes {\n    to { opacity = "1" }\n  }\n  timing {\n    easing = ease-out\n  }\n}\n`,
    expected: "0s ease-out 0s 1 normal both running both",
  },
];

describe("the screen preview writes an animation's timing as the player's shorthand (#2822)", () => {
  test.each(CASES)("writes $name as a full shorthand with its name last", ({ name, screen: src, expected }) => {
    expect(screen(src, name)).toBe(expected);
  });

  test.each(CASES)("writes $name as the player does", async ({ name, screen: src, player: playerSrc }) => {
    expect(screen(src, name)).toBe(await player(playerSrc, name));
  });
});
