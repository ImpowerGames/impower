import { compile, optimize } from "@tailwindcss/node";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";

type Rule = { selector: string; style: CSSStyleDeclaration; media: string[] };

const styleRules = (
  rules: CSSRuleList,
  media: string[] = [],
  parent = "",
  out: Rule[] = [],
) => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const selector = parent
        ? rule.selectorText.includes("&")
          ? rule.selectorText.replace(/&/g, parent)
          : `${parent} ${rule.selectorText}`
        : rule.selectorText;
      out.push({ selector, style: rule.style, media });
      if (rule.cssRules) styleRules(rule.cssRules, media, selector, out);
    } else if (rule instanceof CSSMediaRule) {
      styleRules(rule.cssRules, [...media, rule.conditionText], parent, out);
    } else if ("cssRules" in rule) {
      styleRules((rule as CSSGroupingRule).cssRules, media, parent, out);
    }
  }
  return out;
};

const compiled = async (classes: string[]) => {
  const source = await readFile(resolve(__dirname, "../src/style.css"), "utf8");
  const compiler = await compile(source, {
    base: resolve(__dirname, "../src"),
    onDependency: () => {},
  });
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const rules = styleRules(style.sheet!.cssRules);
  style.remove();
  return rules;
};

const matching = (rules: Rule[], element: Element) =>
  rules.filter(({ selector }) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });

const declaring = (rules: Rule[], property: string) =>
  rules
    .filter(({ style }) => style.getPropertyValue(property))
    .map(({ style, media }) => ({
      value: style.getPropertyValue(property),
      coarse: media.some((m) => m.includes("pointer: coarse")),
    }));

it.each(["input", "button"] as const)(
  "centres an inline-hit box's %s so the coarse-pointer 44px target overflows it evenly",
  async (tag) => {
    const box = document.createElement("span");
    box.className = "inline-hit";
    const input = box.appendChild(document.createElement(tag));
    if (input instanceof HTMLInputElement) input.type = "text";
    document.body.append(box);

    const rules = await compiled(["inline-hit"]);
    const onBox = matching(rules, box);
    expect(declaring(onBox, "display")).toContainEqual({
      value: "flex",
      coarse: false,
    });
    expect(declaring(onBox, "align-items")).toContainEqual({
      value: "center",
      coarse: false,
    });

    const onInput = matching(rules, input);
    expect(declaring(onInput, "height")).toEqual([
      { value: "100%", coarse: false },
    ]);
    expect(declaring(onInput, "flex").map(({ value }) => value)).toEqual([
      expect.stringMatching(/^(none|0 0 auto)$/),
    ]);
    expect(declaring(onInput, "min-height")).toEqual([
      { value: "44px", coarse: true },
    ]);
    expect(declaring(onInput, "max-height")).toEqual([]);

    box.remove();
  },
);

const targetRule = (rules: Rule[], box: Element) =>
  rules.filter(({ selector }) => {
    const pseudo = /::?before$/.exec(selector);
    if (!pseudo) return false;
    const host = selector.slice(0, pseudo.index);
    try {
      return box.matches(host);
    } catch {
      return false;
    }
  });

const targetOf = (
  rules: Rule[],
  box: Element,
  visible: { top: number; bottom: number },
  bound: { top: number; bottom: number },
) => {
  const rule = targetRule(rules, box).find(({ media }) =>
    media.some((m) => m.includes("pointer: coarse")),
  )!;
  const height = parseFloat(rule.style.getPropertyValue("height"));
  const target = rule.style.getPropertyValue("bottom")
    ? { top: visible.bottom - height, bottom: visible.bottom }
    : { top: visible.top, bottom: visible.top + height };
  return {
    top: Math.max(Math.min(target.top, visible.top), bound.top),
    bottom: Math.min(Math.max(target.bottom, visible.bottom), bound.bottom),
  };
};

it.each([
  ["inline-hit-up", "bottom"],
  ["inline-hit-down", "top"],
] as const)(
  "%s keeps its control the size of its box and lays a 44px coarse-pointer target from its %s edge, away from the blocked side",
  async (utility, edge) => {
    const box = document.createElement("label");
    box.className = utility;
    const button = box.appendChild(document.createElement("button"));
    document.body.append(box);

    const rules = await compiled([utility]);
    const onButton = matching(rules, button);
    expect(declaring(onButton, "height")).toContainEqual({
      value: "100%",
      coarse: false,
    });
    const minHeights = declaring(onButton, "min-height");
    expect(minHeights).toContainEqual({ value: "0", coarse: false });
    expect(
      onButton.find(
        ({ style }) => style.getPropertyValue("min-height") === "0",
      )!.selector,
    ).not.toMatch(/:where/);

    const target = targetRule(rules, box);
    expect(target).toHaveLength(1);
    expect(target[0]!.media.some((m) => m.includes("pointer: coarse"))).toBe(
      true,
    );
    expect(target[0]!.style.getPropertyValue("position")).toBe("absolute");
    expect(target[0]!.style.getPropertyValue("height")).toBe("44px");
    expect(target[0]!.style.getPropertyValue(edge)).toBe("0");
    expect(
      target[0]!.style.getPropertyValue(edge === "top" ? "bottom" : "top"),
    ).toBe("");

    box.remove();
  },
);

it.each([
  ["a phone title bar", { top: 0, bottom: 54 }, [8, 28], [28, 46]],
  ["a compact top bar", { top: 0, bottom: 54 }, [5, 29], [30, 48]],
  ["a wide top bar", { top: 0, bottom: 76 }, [16, 40], [41, 59]],
] as const)(
  "in %s, two stacked controls never share a target and a tap anywhere on either visible box reaches it",
  async (_, barBox, upper, lower) => {
    const bar = document.createElement("header");
    bar.className = "hit-bound";
    const up = bar.appendChild(document.createElement("label"));
    up.className = "inline-hit-up";
    const down = bar.appendChild(document.createElement("label"));
    down.className = "inline-hit-down";
    document.body.append(bar);

    const rules = await compiled([
      "hit-bound",
      "inline-hit-up",
      "inline-hit-down",
    ]);
    expect(declaring(matching(rules, bar), "overflow")).toEqual([
      { value: "clip", coarse: false },
    ]);

    const upBox = { top: upper[0], bottom: upper[1] };
    const downBox = { top: lower[0], bottom: lower[1] };
    const upTarget = targetOf(rules, up, upBox, barBox);
    const downTarget = targetOf(rules, down, downBox, barBox);

    expect(upTarget.bottom).toBeLessThanOrEqual(downTarget.top);
    expect(upTarget.bottom).toBeLessThanOrEqual(downBox.top);
    expect(downTarget.top).toBeGreaterThanOrEqual(upBox.bottom);
    for (const [target, box] of [
      [upTarget, upBox],
      [downTarget, downBox],
    ] as const) {
      expect(target.top).toBeLessThanOrEqual(box.top);
      expect(target.bottom).toBeGreaterThanOrEqual(box.bottom);
      expect(target.top).toBeGreaterThanOrEqual(barBox.top);
      expect(target.bottom).toBeLessThanOrEqual(barBox.bottom);
    }

    bar.remove();
  },
);

it("fade-edge-over fades a row's end with an overlay that taps pass through, so an inline-hit target inside it keeps its height", async () => {
  const row = document.createElement("div");
  row.className = "fade-edge-over";
  document.body.append(row);

  const rules = await compiled(["fade-edge-over"]);
  const onRow = matching(rules, row);
  expect(declaring(onRow, "overflow-x")).toEqual([
    { value: "clip", coarse: false },
  ]);
  expect(declaring(onRow, "overflow-y")).toEqual([]);
  expect(declaring(onRow, "overflow")).toEqual([]);
  expect(declaring(onRow, "mask-image")).toEqual([]);
  expect(declaring(onRow, "-webkit-mask-image")).toEqual([]);

  const overlay = rules.filter(({ selector }) =>
    /^\.fade-edge-over::?after$/.test(selector),
  );
  expect(overlay).toHaveLength(1);
  expect(overlay[0]!.style.getPropertyValue("pointer-events")).toBe("none");
  expect(overlay[0]!.style.getPropertyValue("position")).toBe("absolute");
  expect(overlay[0]!.style.getPropertyValue("width")).toBe("var(--fade)");

  row.remove();
});
