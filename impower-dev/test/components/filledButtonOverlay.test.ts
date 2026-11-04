import { compile, optimize } from "@tailwindcss/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonVariants } from "../../../packages/impower-ui/src/components/button/Button";

vi.mock("@radix-ui/react-slot", () => ({ Slot: "span" }));

const beforeRules = async (classes: string[]): Promise<CSSStyleDeclaration[]> => {
  const compiler = await compile('@import "tailwindcss/utilities";', {
    base: process.cwd(),
    onDependency: () => {},
  });
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const out: CSSStyleDeclaration[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (/::?before\b/.test(rule.selectorText) && !/:(hover|active)\b/.test(rule.selectorText)) {
          out.push(rule.style);
        }
      } else if ("cssRules" in rule) {
        walk((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  walk(style.sheet!.cssRules);
  return out;
};

describe.each(["primary", "secondary", "destructive", "fab"] as const)(
  "%s Button's hover and press overlay",
  (variant) => {
    afterEach(() => {
      document.head.innerHTML = "";
    });

    const classes = () => buttonVariants({ variant, size: "fab" }).split(/\s+/).filter(Boolean);

    it("lets pointer events through to the button's content", async () => {
      const rules = await beforeRules(classes());
      expect(rules.some((s) => s.getPropertyValue("position") === "absolute")).toBe(true);
      expect(rules.some((s) => s.getPropertyValue("pointer-events") === "none")).toBe(true);
    });

    it("follows the button's border radius", async () => {
      const rules = await beforeRules(classes());
      expect(rules.some((s) => s.getPropertyValue("border-radius") === "inherit")).toBe(true);
    });
  },
);
