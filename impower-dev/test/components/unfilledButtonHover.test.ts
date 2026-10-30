import { compile, optimize } from "@tailwindcss/node";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { twMerge } from "tailwind-merge";
import ts from "typescript";
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

    it("lets pointer events through the overlay to the button's content", async () => {
      const rules = await rulesFor(classes());
      const overlay = rules.filter(({ selector }) => /::?after\b/.test(selector));
      expect(
        overlay.some(({ style }) => style.getPropertyValue("pointer-events") === "none"),
      ).toBe(true);
    });
  },
);

interface CallSite {
  location: string;
  variant: "ghost" | "outline";
  label: string;
  classText: string;
}

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : tsxFiles(path);
    }
    return entry.name.endsWith(".tsx") ? [path] : [];
  });

const literalText = (node: ts.Node): string[] => {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return [node.text];
  }
  const parts: string[] = [];
  node.forEachChild((child) => {
    parts.push(...literalText(child));
  });
  return parts;
};

const unfilledCallSites = (): CallSite[] => {
  const roots = [resolve("src"), resolve("../packages/impower-ui/src")];
  const sites: CallSite[] = [];
  for (const file of roots.flatMap(tsxFiles)) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(source) === "Button"
      ) {
        const attribute = (name: string) =>
          node.attributes.properties.find(
            (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === name,
          );
        const variant = attribute("variant")?.initializer;
        if (variant && ts.isStringLiteral(variant) && (variant.text === "ghost" || variant.text === "outline")) {
          const classInit = (attribute("class") ?? attribute("className"))?.initializer;
          const labelInit = attribute("aria-label")?.initializer;
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          sites.push({
            location: `${relative(resolve(".."), file).split("\\").join("/")}:${line + 1}`,
            variant: variant.text,
            label: labelInit && ts.isStringLiteral(labelInit) ? labelInit.text : "",
            classText: classInit ? literalText(classInit).join(" ") : "",
          });
        }
      }
      node.forEachChild(visit);
    };
    visit(source);
  }
  return sites;
};

describe("ghost and outline Button call sites", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("finds the call sites", () => {
    expect(unfilledCallSites().length).toBeGreaterThan(50);
  });

  it("leave no hover or press background in the merged classes", () => {
    const swapping = unfilledCallSites()
      .filter(({ variant, classText }) =>
        twMerge(buttonVariants({ variant }), classText)
          .split(/\s+/)
          .some((name) => /^(hover|active):bg-/.test(name)),
      )
      .map(({ location }) => location);
    expect(swapping).toEqual([]);
  });

  it("compose a real caller's classes without a hover or press background rule", async () => {
    const caller = unfilledCallSites().find(
      ({ location, label }) => location.includes("AudioPreview.tsx") && label === "Loop",
    );
    expect(caller).toBeDefined();
    const merged = twMerge(buttonVariants({ variant: caller!.variant }), caller!.classText)
      .split(/\s+/)
      .filter(Boolean);
    const rules = await rulesFor(merged);
    const swaps = rules.filter(
      ({ selector, style }) =>
        /:(hover|active)\b/.test(selector) &&
        !isPseudoElement(selector) &&
        style.getPropertyValue("background-color") !== "",
    );
    expect(swaps.map((r) => r.selector)).toEqual([]);
    expect(rules.some(({ selector }) => /::?after\b/.test(selector) && selector.includes(":hover"))).toBe(true);
  });
});
