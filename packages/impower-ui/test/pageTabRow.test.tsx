import { compile, optimize } from "@tailwindcss/node";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabbedPage from "../src/components/tabbed-page/TabbedPage";
import Tabs, { Tab } from "../src/components/tabs/Tabs";

type Rule = { selector: string; style: CSSStyleDeclaration; media: string[] };

const styleRules = (rules: CSSRuleList, media: string[] = [], parent = "", out: Rule[] = []) => {
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
  const compiler = await compile(source, { base: resolve(__dirname, "../src"), onDependency: () => {} });
  const style = document.createElement("style");
  style.textContent = optimize(compiler.build(classes), { minify: false }).code;
  document.head.append(style);
  const rules = styleRules(style.sheet!.cssRules);
  style.remove();
  return rules;
};

const px = (value: string | undefined) => {
  const text = (value ?? "").trim();
  if (text === "var(--spacing)") return 4;
  const spacing = /^calc\(var\(--spacing\)\s*\*\s*([\d.]+)\)$/.exec(text);
  if (spacing) return Number(spacing[1]) * 4;
  const plain = /^([\d.]+)px$/.exec(text);
  return plain ? Number(plain[1]) : null;
};

const cascaded = (rules: Rule[], element: Element, property: string) => px(declaredValue(rules, element, property));

const declaredValue = (rules: Rule[], element: Element, property: string) => {
  let value: string | undefined;
  for (const { selector, style, media } of rules) {
    if (media.length > 0) continue;
    let hit = false;
    try {
      hit = element.matches(selector);
    } catch {
      hit = false;
    }
    const declared = style.getPropertyValue(property);
    if (hit && declared) value = declared;
  }
  return value;
};

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const mountAt = async (layout: "phone" | "compact" | "desktop") => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  host = document.body.appendChild(document.createElement("div"));
  host.dataset.layout = layout;
  await act(async () =>
    render(
      <Tabs variant="page" iconLayout="beside" value="all" onChange={() => {}}>
        <Tab value="all">All scripts</Tab>
        <Tab value="outline">In this script</Tab>
      </Tabs>,
      host!,
    ),
  );
  const list = host.querySelector<HTMLElement>('[role="tablist"]')!;
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
  const classes = [list, ...tabs].flatMap((element) => Array.from(element.classList));
  return { list, tabs, rules: await compiled(classes) };
};

describe("Tabs page variant", () => {
  it.each([
    ["phone", 46, 13, 22],
    ["compact", 46, 13, 22],
    ["desktop", 48, 13, 20],
  ] as const)("at the %s layout gives each tab a %ipx row with %ipx text and 4px padding, %ipx apart", async (layout, height, size, gap) => {
    const { list, tabs, rules } = await mountAt(layout);
    expect(cascaded(rules, list, "gap")).toBe(gap);
    for (const tab of tabs) {
      expect(cascaded(rules, tab, "min-height")).toBe(height);
      expect(cascaded(rules, tab, "font-size")).toBe(size);
      expect(cascaded(rules, tab, "padding-inline")).toBe(4);
      expect(cascaded(rules, tab, "min-width")).toBeGreaterThanOrEqual(44);
      expect(declaredValue(rules, tab, "flex")).toBe("none");
    }
    const [active, inactive] = tabs;
    expect(active!.dataset.state).toBe("active");
    expect(declaredValue(rules, active!, "font-weight")).toBe(declaredValue(rules, inactive!, "font-weight"));
  });
});

describe("Tabs page variant underline", () => {
  const TABS = { all: { x: 16, w: 66 }, outline: { x: 104, w: 82 } } as const;

  const mountMeasured = async (value: keyof typeof TABS) => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const rect = (x: number, w: number) => ({ x, y: 0, left: x, top: 0, width: w, height: 46, right: x + w, bottom: 46, toJSON() {} }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") !== "tab") return rect(16, 398);
      const tab = TABS[this.textContent!.includes("All scripts") ? "all" : "outline"];
      return rect(tab.x, tab.w);
    });
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
      const style = original(element);
      if (element.getAttribute("role") !== "tab") return style;
      return new Proxy(style, {
        get: (target, key) => (key === "paddingLeft" || key === "paddingRight" ? "4px" : Reflect.get(target, key)),
      });
    });
    host = document.body.appendChild(document.createElement("div"));
    host.dataset.layout = "phone";
    await act(async () =>
      render(
        <Tabs variant="page" iconLayout="beside" value={value} onChange={() => {}}>
          <Tab value="all">All scripts</Tab>
          <Tab value="outline">In this script</Tab>
        </Tabs>,
        host!,
      ),
    );
    return host.querySelector<HTMLElement>('[role="tablist"] > [aria-hidden="true"]')!;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["all", "outline"] as const)("spans only the label of the current %s tab, inside its 4px padding", async (value) => {
    const indicator = await mountMeasured(value);
    const tab = TABS[value];
    expect(indicator.style.transform).toBe(`translateX(${tab.x - 16 + 4}px)`);
    expect(indicator.style.width).toBe(`${tab.w - 8}px`);
  });
});

describe("TabbedPage tab row", () => {
  it.each([
    ["phone", 16],
    ["compact", 16],
    ["desktop", 18],
  ] as const)("at the %s layout insets the row %ipx from the page edges", async (layout, inset) => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    host = document.body.appendChild(document.createElement("div"));
    host.dataset.layout = layout;
    await act(async () =>
      render(
        <TabbedPage
          title="Scripts"
          onBack={() => {}}
          value="all"
          onValueChange={() => {}}
          tabs={[
            { value: "all", label: "All scripts", content: null },
            { value: "outline", label: "In this script", content: null },
          ]}
        />,
        host!,
      ),
    );
    const list = host.querySelector<HTMLElement>('[role="tablist"]')!;
    const row = list.parentElement!;
    const rules = await compiled(Array.from(row.classList));
    expect(cascaded(rules, row, "margin-inline")).toBe(inset);
  });
});
