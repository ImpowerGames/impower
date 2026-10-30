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
  unresolved: string[];
}

interface ClassSources {
  text: string[];
  unresolved: string[];
}

interface ParsedFile {
  path: string;
  source: ts.SourceFile;
  constants: Map<string, ts.Expression>;
}

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : tsxFiles(path);
    }
    return entry.name.endsWith(".tsx") ? [path] : [];
  });

const parseFile = (path: string): ParsedFile => {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const constants = new Map<string, ts.Expression>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer);
    }
    node.forEachChild(collect);
  };
  collect(source);
  return { path, source, constants };
};

const classSources = (file: ParsedFile, node: ts.Node, seen = new Set<string>()): ClassSources => {
  const result: ClassSources = { text: [], unresolved: [] };
  const add = (other: ClassSources) => {
    result.text.push(...other.text);
    result.unresolved.push(...other.unresolved);
  };
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    result.text.push(node.text);
  } else if (ts.isConditionalExpression(node)) {
    add(classSources(file, node.whenTrue, seen));
    add(classSources(file, node.whenFalse, seen));
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    add(classSources(file, node.right, seen));
  } else if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) {
    add(classSources(file, node.expression, seen));
  } else if (ts.isPropertyAssignment(node)) {
    add(classSources(file, node.initializer, seen));
  } else if (ts.isIdentifier(node)) {
    const constant = file.constants.get(node.text);
    if (constant && !seen.has(node.text)) {
      add(classSources(file, constant, new Set([...seen, node.text])));
    } else if (!constant) {
      result.unresolved.push(node.text);
    }
  } else {
    node.forEachChild((child) => add(classSources(file, child, seen)));
  }
  return result;
};

const jsxAttribute = (file: ParsedFile, node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) =>
  node.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(file.source) === name,
  );

const locationOf = (file: ParsedFile, node: ts.Node) => {
  const { line } = file.source.getLineAndCharacterOfPosition(node.getStart(file.source));
  return `${relative(resolve(".."), file.path).split("\\").join("/")}:${line + 1}`;
};

const classPropOf = (node: ts.Node): { component: string; local: string } | undefined => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name) {
      const props = parent.parameters[0]?.name;
      if (!props || !ts.isObjectBindingPattern(props)) {
        return undefined;
      }
      for (const element of props.elements) {
        const prop = (element.propertyName ?? element.name).getText();
        if ((prop === "class" || prop === "className") && ts.isIdentifier(element.name)) {
          return { component: parent.name.text, local: element.name.text };
        }
      }
      return undefined;
    }
  }
  return undefined;
};

const unfilledCallSites = (): CallSite[] => {
  const roots = [resolve("src"), resolve("../packages/impower-ui/src")];
  const files = roots.flatMap(tsxFiles).map(parseFile);
  const sites: CallSite[] = [];
  const wrappers: { component: string; local: string; site: CallSite }[] = [];
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(file.source) === "Button"
      ) {
        const variant = jsxAttribute(file, node, "variant")?.initializer;
        if (variant && ts.isStringLiteral(variant) && (variant.text === "ghost" || variant.text === "outline")) {
          const classInit = (jsxAttribute(file, node, "class") ?? jsxAttribute(file, node, "className"))?.initializer;
          const labelInit = jsxAttribute(file, node, "aria-label")?.initializer;
          const sources = classInit ? classSources(file, classInit) : { text: [], unresolved: [] };
          const site: CallSite = {
            location: locationOf(file, node),
            variant: variant.text,
            label: labelInit && ts.isStringLiteral(labelInit) ? labelInit.text : "",
            classText: sources.text.join(" "),
            unresolved: sources.unresolved,
          };
          const prop = classPropOf(node);
          if (prop && site.unresolved.includes(prop.local)) {
            wrappers.push({ ...prop, site });
          } else {
            sites.push(site);
          }
        }
      }
      node.forEachChild(visit);
    };
    visit(file.source);
  }
  for (const wrapper of wrappers) {
    for (const file of files) {
      const visit = (node: ts.Node) => {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(file.source) === wrapper.component
        ) {
          const classInit = (jsxAttribute(file, node, "class") ?? jsxAttribute(file, node, "className"))?.initializer;
          const sources = classInit ? classSources(file, classInit) : { text: [], unresolved: [] };
          sites.push({
            location: `${locationOf(file, node)} via ${wrapper.site.location}`,
            variant: wrapper.site.variant,
            label: wrapper.site.label,
            classText: `${wrapper.site.classText} ${sources.text.join(" ")}`,
            unresolved: [...wrapper.site.unresolved.filter((name) => name !== wrapper.local), ...sources.unresolved],
          });
        }
        node.forEachChild(visit);
      };
      visit(file.source);
    }
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

  it("read every call site's classes, through constants and wrapper components", () => {
    const sites = unfilledCallSites();
    expect(
      sites.filter(({ unresolved }) => unresolved.length > 0).map(({ location, unresolved }) => `${location}: ${unresolved.join(", ")}`),
    ).toEqual([]);
    const options = sites.filter(({ location }) => location.includes("FileOptionsButton.tsx"));
    expect(options.length).toBe(2);
    expect(options.every(({ classText }) => classText.includes("text-foreground/50"))).toBe(true);
    const throughWrapper = sites.filter(({ location }) => location.includes(" via ") && location.includes("OptionButton.tsx"));
    expect(throughWrapper.length).toBeGreaterThan(0);
    expect(throughWrapper.every(({ classText }) => classText.includes("text-foreground/80"))).toBe(true);
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
