import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, type ComponentChild, type Ref } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import Button, { buttonVariants, type ButtonSize } from "./Button";

const SIZES = [undefined, "default", "sm", "xs", "lg", "icon", "icon-lg", "fab"] as const satisfies readonly (
  | ButtonSize
  | undefined
)[];

const BOX_PROPERTIES = [
  "height",
  "width",
  "padding",
  "padding-inline",
  "padding-block",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
];

const themeBlock = (): string => {
  const source = readFileSync(resolve("src/style.css"), "utf8");
  const start = source.indexOf("@theme {");
  const end = source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) {
    throw new Error("@theme block not found in impower-ui style.css");
  }
  return source.slice(start, end + 2);
};

const installCss = async (classes: string[], withTheme: boolean): Promise<CSSRuleList> => {
  const input = withTheme
    ? `@import "tailwindcss/theme";\n@import "tailwindcss/utilities";\n${themeBlock()}`
    : '@import "tailwindcss/utilities";';
  const compiler = await compile(input, { base: process.cwd(), onDependency: () => {} });
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return style.sheet!.cssRules;
};

const styleRules = (rules: CSSRuleList, out: CSSStyleRule[] = []): CSSStyleRule[] => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      out.push(rule);
    } else if ("cssRules" in rule) {
      styleRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
  return out;
};

const boxDeclarations = async (classes: string[]): Promise<string[]> => {
  const out: string[] = [];
  for (const rule of styleRules(await installCss(classes, true))) {
    if (/:(hover|active|focus)/.test(rule.selectorText) || /::?(before|after)\b/.test(rule.selectorText)) {
      continue;
    }
    for (const property of BOX_PROPERTIES) {
      const value = rule.style.getPropertyValue(property);
      if (value) {
        out.push(`${rule.selectorText} { ${property}: ${value} }`);
      }
    }
  }
  return out;
};

const mount = async (node: ComponentChild): Promise<HTMLDivElement> => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(node, host);
  });
  return host;
};

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("link Button sizing", () => {
  it.each(SIZES)("size %s sizes to its content with no padding", async (size) => {
    const host = await mount(
      size ? <Button variant="link" size={size}>Text</Button> : <Button variant="link">Text</Button>,
    );
    const classes = host.querySelector("button")!.className.split(/\s+/).filter(Boolean);
    const declarations = await boxDeclarations(classes);
    expect(declarations.length).toBeGreaterThan(0);
    expect(
      declarations.filter((declaration) => !/:\s*(auto|0|0px|calc\(var\(--spacing\)\s*\*\s*0\))\s*}$/.test(declaration)),
    ).toEqual([]);
  });
});

describe.each(["primary", "secondary", "destructive", "fab"] as const)(
  "%s Button's hover and press overlay",
  (variant) => {
    const beforeRules = async () =>
      styleRules(
        await installCss(buttonVariants({ variant, size: "fab" }).split(/\s+/).filter(Boolean), false),
      )
        .filter(({ selectorText }) => /::?before\b/.test(selectorText) && !/:(hover|active)\b/.test(selectorText))
        .map(({ style }) => style);

    it("lets pointer events through to the button's content", async () => {
      const rules = await beforeRules();
      expect(rules.some((s) => s.getPropertyValue("position") === "absolute")).toBe(true);
      expect(rules.some((s) => s.getPropertyValue("pointer-events") === "none")).toBe(true);
    });

    it("follows the button's border radius", async () => {
      const rules = await beforeRules();
      expect(rules.some((s) => s.getPropertyValue("border-radius") === "inherit")).toBe(true);
    });
  },
);

describe("Button asChild", () => {
  it("slots its props onto the single child element", async () => {
    const host = await mount(
      <Button asChild variant="outline">
        <a href="#open">Open</a>
      </Button>,
    );
    const anchor = host.querySelector("a");
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild).toBe(anchor);
    expect(anchor?.textContent).toBe("Open");
    expect(anchor?.getAttribute("href")).toBe("#open");
    expect(anchor?.className).toContain("inline-flex");
    expect(host.querySelector("button")).toBeNull();
  });

  it("forwards its ref to the slotted child", async () => {
    const ref: { current: HTMLElement | null } = { current: null };
    const host = await mount(
      <Button asChild ref={ref as Ref<HTMLButtonElement>}>
        <a href="#open">Open</a>
      </Button>,
    );
    expect(ref.current).toBe(host.querySelector("a"));
  });

  it("renders a button that keeps its ripple without asChild", async () => {
    const host = await mount(<Button>Go</Button>);
    const button = host.querySelector("button");
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.textContent).toBe("Go");
    expect(button?.childNodes.length).toBeGreaterThan(1);
  });
});
