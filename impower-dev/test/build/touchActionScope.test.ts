import { compile, optimize } from "@tailwindcss/node";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const SRC = path.resolve(HERE, "../../src");
const IMPOWER_UI_SRC = path.resolve(REPO, "packages/impower-ui/src");
const SCRIPT_EDITOR_CSS = path.resolve(
  REPO,
  "packages/sparkdown-document-views/src/modules/script-editor/sparkdown-script-editor.css",
);

const PAGE_STYLESHEETS = [
  path.join(SRC, "public/document.css"),
  path.join(SRC, "modules/spark-editor/styles/normalize/normalize.css"),
  path.join(SRC, "modules/spark-editor/styles/theme/theme.css"),
  path.join(IMPOWER_UI_SRC, "theme.css"),
];

const PLAIN_ELEMENTS = ["div", "span", "p", "h3", "li", "button", "img", "input", "textarea", "nav", "section"];

const HORIZONTAL_SCROLLERS = [
  "components/carousel/Carousel.tsx",
  "components/tabs/Tabs.tsx",
  "components/jump-chips/JumpChips.tsx",
  "components/color-chips/ColorChips.tsx",
];

const RAW_HORIZONTAL_OVERFLOW = /(?<![\w-])(?:[\w-]+:)*overflow-x-(?:auto|scroll)(?![\w-])/g;

const SCROLLER = /(?<![\w-])(?:[\w-]+:)*scroller-x(?![\w-])/;

const styleRules = (rules: CSSRuleList, out: CSSStyleRule[] = []): CSSStyleRule[] => {
  for (const rule of Array.from(rules)) {
    if ("selectorText" in rule && "style" in rule) {
      out.push(rule as CSSStyleRule);
    } else if ("cssRules" in rule) {
      styleRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
  return out;
};

const touchActionRules = (css: string) => {
  const dom = new JSDOM(
    `<!doctype html><html><head><style></style></head><body><main>${PLAIN_ELEMENTS.map((tag) => `<${tag}></${tag}>`).join("")}</main></body></html>`,
  );
  const document = dom.window.document;
  document.querySelector("style")!.textContent = css;
  const plain = PLAIN_ELEMENTS.map((tag) => document.querySelector(`main > ${tag}`)!);
  return styleRules(document.querySelector("style")!.sheet!.cssRules)
    .filter((rule) => rule.style.getPropertyValue("touch-action") !== "")
    .map((rule) => ({
      selector: rule.selectorText,
      value: rule.style.getPropertyValue("touch-action"),
      plain: plain
        .filter((el) => {
          try {
            return el.matches(rule.selectorText);
          } catch {
            return false;
          }
        })
        .map((el) => el.tagName.toLowerCase()),
    }));
};

const packageCss = async (classes: string[]) => {
  const source = fs.readFileSync(path.join(IMPOWER_UI_SRC, "style.css"), "utf8");
  const compiler = await compile(source, { base: IMPOWER_UI_SRC, onDependency: () => {} });
  return optimize(compiler.build(classes), { minify: false }).code;
};

const compiledTouchActions = (css: string) =>
  [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].flatMap(([, list, body]) => {
    const value = /(?:^|[;\s])touch-action\s*:\s*([^;]+);/.exec(body!)?.[1]?.trim();
    const overflowX = /(?:^|[;\s])overflow-x\s*:\s*([^;]+);/.exec(body!)?.[1]?.trim();
    return value ? list!.split(/,(?![^(]*\))/).map((selector) => ({ selector: selector.trim(), value, overflowX })) : [];
  });

const universalOrElementWide = (selector: string) => {
  const compound = selector
    .split(/[\s>+~]+(?![^(]*\))/)
    .pop()!
    .replace(/::?[a-z-]+(\([^)]*\))?/g, "");
  return compound === "" || compound === "*" || /^[a-z][a-z0-9-]*$/.test(compound);
};

const sourceFiles =(dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });

const relative = (file: string) => path.relative(REPO, file).split(path.sep).join("/");

describe("where the editor page sets touch-action", () => {
  it.each(PAGE_STYLESHEETS.map((file) => [relative(file), file]))(
    "%s sets it on no universal or element-wide selector, so a sideways swipe on a scroller's item still pans the scroller",
    (_name, file) => {
      const offending = touchActionRules(fs.readFileSync(file, "utf8")).filter(({ plain }) => plain.length > 0);
      expect(offending).toEqual([]);
    },
  );

  it("impower-ui's compiled stylesheet sets it on no universal or bare element selector", async () => {
    const css = await packageCss(["scroller-x", "touch-pan-y", "touch-none", "overflow-y-auto", "truncate"]);
    const rules = compiledTouchActions(css);
    expect(rules.filter(({ selector }) => universalOrElementWide(selector))).toEqual([]);
    expect(rules.map(({ selector }) => selector)).toEqual(expect.arrayContaining([".scroller-x", ".touch-pan-y", ".touch-none"]));
  });

  it("a horizontal scroller is scroller-x: it scrolls sideways and lets a touch pan either axis, under any layout variant", async () => {
    const css = await packageCss(["scroller-x", "phone:scroller-x", "compact:scroller-x"]);
    const rules = compiledTouchActions(css);
    for (const name of ["scroller-x", "phone:scroller-x", "compact:scroller-x"]) {
      const escaped = `.${name.replace(":", "\\:")}`;
      const rule = rules.find(({ selector }) => selector.startsWith(escaped));
      expect(rule?.value, name).toBe("pan-x pan-y");
      expect(rule?.overflowX, name).toBe("auto");
    }
  });

  it.each(HORIZONTAL_SCROLLERS)("impower-ui's %s scrolls sideways through scroller-x", (file) => {
    expect(fs.readFileSync(path.join(IMPOWER_UI_SRC, file), "utf8")).toMatch(SCROLLER);
  });

  it("no impower-ui or editor source makes a sideways scroller without scroller-x", () => {
    const offending = [...sourceFiles(IMPOWER_UI_SRC), ...sourceFiles(SRC)].flatMap((file) =>
      [...fs.readFileSync(file, "utf8").matchAll(RAW_HORIZONTAL_OVERFLOW)].map((match) => `${relative(file)}: ${match[0]}`),
    );
    expect(offending).toEqual([]);
  });

  it("the script editor keeps vertical-only panning inside its own root, where every line wraps and nothing scrolls sideways", () => {
    const rules = touchActionRules(fs.readFileSync(SCRIPT_EDITOR_CSS, "utf8"));
    expect(rules.map(({ selector, value }) => [selector, value])).toEqual([[".sparkdown-script-editor-root *", "pan-y"]]);
    expect(rules.every(({ plain }) => plain.length === 0)).toBe(true);
  });
});
