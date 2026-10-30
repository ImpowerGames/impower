import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { twMerge } from "tailwind-merge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonVariants } from "../../../packages/impower-ui/src/components/button/Button";

vi.mock("@radix-ui/react-slot", () => ({ Slot: "span" }));

const RESTING_TINT = "bg-primary/15";

interface StyleRule {
  selector: string;
  style: CSSStyleDeclaration;
}

const collectRules = (rules: CSSRuleList, out: StyleRule[] = []): StyleRule[] => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      out.push({ selector: rule.selectorText, style: rule.style });
    } else if ("cssRules" in rule) {
      collectRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
  return out;
};

const themeBlock = (): string => {
  const source = readFileSync(resolve("../packages/impower-ui/src/style.css"), "utf8");
  const start = source.indexOf("@theme {");
  const end = source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) {
    throw new Error("@theme block not found in impower-ui style.css");
  }
  return source.slice(start, end + 2);
};

const rulesFor = async (classes: string[]): Promise<StyleRule[]> => {
  const input = `@import "tailwindcss/theme";\n@import "tailwindcss/utilities";\n${themeBlock()}`;
  const compiler = await compile(input, {
    base: process.cwd(),
    onDependency: () => {},
  });
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return collectRules(style.sheet!.cssRules);
};

const isPseudoElement = (selector: string) => /::?(before|after)\b/.test(selector);

describe.each(["ghost", "outline"] as const)(
  "%s Button with a resting tint",
  (variant) => {
    afterEach(() => {
      document.head.innerHTML = "";
    });

    const classes = () =>
      twMerge(buttonVariants({ variant }), RESTING_TINT).split(/\s+/).filter(Boolean);

    it("keeps its resting background on hover and press", async () => {
      expect(classes()).toContain(RESTING_TINT);
      const rules = await rulesFor(classes());
      const resting = rules.filter(
        ({ selector, style }) =>
          !/:(hover|active)\b/.test(selector) &&
          !isPseudoElement(selector) &&
          style.getPropertyValue("background-color") !== "",
      );
      expect(resting.map((r) => r.selector).join(" ")).toContain("bg-primary");
      const swaps = rules.filter(
        ({ selector, style }) =>
          /:(hover|active)\b/.test(selector) &&
          !isPseudoElement(selector) &&
          style.getPropertyValue("background-color") !== "",
      );
      expect(swaps.map((r) => r.selector)).toEqual([]);
    });

    it("tints hover and press with a currentColor overlay at 0.05 and 0.12", async () => {
      const rules = await rulesFor(classes());
      const overlay = rules.filter(({ selector }) => /::?after\b/.test(selector));
      const opacityWhen = (state: "hover" | "active") =>
        overlay
          .filter(({ selector }) => selector.includes(`:${state}`))
          .map(({ style }) => style.getPropertyValue("opacity"))
          .filter(Boolean)
          .map(Number);
      expect(
        overlay.some(({ style }) => style.getPropertyValue("background-color").toLowerCase() === "currentcolor"),
      ).toBe(true);
      expect(opacityWhen("hover")).toContain(0.05);
      expect(opacityWhen("active")).toContain(0.12);
    });
  },
);
