import { isTokenIdent, tokenize } from "@csstools/css-tokenizer";
import { beforeAll, describe, expect, it } from "vitest";
import { getAnimationContent } from "@impower/spark-dom/src/utils/getAnimationContent";
import { getFontContent } from "@impower/spark-dom/src/utils/getFontContent";
import { getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import { getVarName } from "@impower/spark-engine/src/game/modules/ui/utils/getVarName";
import { renderVNode } from "../../../../sparkle-screen-renderer/src";
import type { SparkleNode } from "../../../../sparkle-screen-renderer/src/parser/parser";
import { createScreenRenderContext } from "../../../../sparkle-screen-preview/src/utils/createScreenRenderContext";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { escapeCssIdentifier } from "../../../../sparkle-style-transformer/src/utils/themeVariableName";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const NAMES = ["my.font", "a~b", "Fira Code", "1st", "a@b"];
const WORD_NAMES = NAMES.filter((name) => !name.includes(" "));
const PLAIN = "fade-in";

const identValues = (css: string) =>
  tokenize({ css })
    .filter(isTokenIdent)
    .map((token) => token[4].value);

const theme = new Set<string>();
const ctx = () => createScreenRenderContext({}, {}, theme);
const valueOf = (property: string, value: string) => (getCssEquivalent(property, value, theme) as [[string, string]])[0][1];
const preludeOf = (rule: string) => rule.slice(0, rule.indexOf("{"));
const declarationOf = (css: string, property: string) => {
  const start = css.indexOf(`${property}:`);
  return start < 0 ? undefined : css.slice(start + property.length + 1, css.indexOf(";", start)).trim();
};

const keyframes = (name: string) => getAnimationContent({ [name]: { keyframes: [{ opacity: 0 }, { opacity: 1 }] } as never }, theme);
const fontFace = (name: string) => getFontContent({ face: { font_family: name, src: "a.woff2" } });
const screenKeyframes = (name: string) =>
  String(
    renderVNode(
      { root: "animation", type: "keyframes", children: [{ root: "animation", type: "to", children: [{ root: "animation", type: "property", args: { key: "opacity", value: "1" } }] }] },
      ctx(),
      { root: "animation", type: "animation", args: { name } },
    ),
  );
const screenTheme = (name: string) =>
  (renderVNode({ root: "theme", type: "theme", args: { name }, children: [] } as SparkleNode, ctx()) as { children: string[] }).children[0]!;

describe("every name writer uses the full CSS identifier escape (#2176)", () => {
  it.each(NAMES)("names the @keyframes rule %s as that one identifier", (name) => {
    expect(identValues(preludeOf(keyframes(name)))).toEqual([name]);
  });

  it.each(NAMES)("writes the @font-face family %s as that one identifier", (name) => {
    expect(identValues(declarationOf(fontFace(name), "font-family")!)).toEqual([name]);
  });

  it.each(WORD_NAMES)("writes the animation-name %s as that one identifier", (name) => {
    expect(identValues(valueOf("animation_name", name))).toEqual([name]);
    expect(identValues(valueOf("animation_name", `${name}, ${PLAIN}`))).toEqual([name, PLAIN]);
  });

  it.each(WORD_NAMES)("writes the animation shorthand's name %s as one identifier and leaves its time and count", (name) => {
    const value = valueOf("animation", `${name} 0.5s infinite`);
    expect(identValues(value)).toEqual([name, "infinite"]);
    expect(value.endsWith(" 0.5s infinite")).toBe(true);
  });

  it.each(WORD_NAMES)("writes the text-font family %s as one identifier beside its fallback", (name) => {
    expect(identValues(valueOf("text-font", `${name}, serif`))).toEqual([name, "serif"]);
    expect(identValues(valueOf("text-font", `var(--font, ${name})`))).toEqual(["--font", name]);
  });

  it.each(NAMES)("names the screen @keyframes rule %s as that one identifier", (name) => {
    expect(identValues(preludeOf(screenKeyframes(name)).replace("@keyframes", ""))).toEqual([name]);
  });

  it.each(WORD_NAMES)("selects the children of the screen theme %s by class and by attribute", (name) => {
    const selector = preludeOf(screenTheme(name)).trim();
    const byClass = document.createElement("div");
    byClass.className = `theme-${name}`;
    const byAttribute = document.createElement("div");
    byAttribute.setAttribute("theme", name);
    const other = document.createElement("div");
    other.classList.add("theme-other");
    for (const parent of [byClass, byAttribute, other]) {
      parent.append(document.createElement("span"));
      document.body.append(parent);
    }
    expect([byClass, byAttribute, other].map((parent) => parent.firstElementChild!.matches(selector))).toEqual([true, true, false]);
    for (const parent of [byClass, byAttribute, other]) parent.remove();
  });

  it("selects the children of a screen theme whose name holds a space by attribute", () => {
    const parent = document.createElement("div");
    parent.setAttribute("theme", "Fira Code");
    parent.append(document.createElement("span"));
    document.body.append(parent);
    expect(parent.firstElementChild!.matches(preludeOf(screenTheme("Fira Code")).trim())).toBe(true);
    parent.remove();
  });
});

describe("a name inside an authored value is read with the grammar of its property (#2176)", () => {
  it.each([
    ["animation", "my\\.font@night 1s"],
    ["animation_name", "my\\.font@night"],
    ["text-font", "my\\.font@night, serif"],
  ])("keeps an authored escape in %s %s as part of one name", (property, value) => {
    expect(identValues(valueOf(property, value))[0]).toBe("my.font@night");
  });

  it.each(["1", "2s", ".5", "50%"])("writes the animation-name %s as one identifier", (name) => {
    expect(identValues(valueOf("animation_name", name))).toEqual([name]);
  });

  it.each(["1", "2s", ".5"])("writes the text-font family %s as one identifier", (name) => {
    expect(identValues(valueOf("text-font", `${name}, serif`))).toEqual([name, "serif"]);
  });

  it.each([
    ['"spin, fast"', '"spin, fast"'],
    [`"spin, fast", ${PLAIN}`, `"spin, fast", ${PLAIN}`],
    [`${PLAIN} , "a,b"`, `${PLAIN}, "a,b"`],
  ])("splits the animation-name %s only at its top-level commas", (value, expected) => {
    expect(valueOf("animation_name", value)).toBe(expected);
  });

  it("leaves a var() animation whole when a word of its fallback names a theme animation", () => {
    const themed = new Set([getVarName("animation", "bounce")]);
    const [[, value]] = getCssEquivalent("animation", "var(--override, bounce 0.5s)", themed) as [[string, string]];
    expect(value).toBe("var(--override, bounce 0.5s)");
  });

  it.each(NAMES)("names the screen animation %s in its timing variable as its @keyframes rule does", (name) => {
    const css = String(
      renderVNode(
        { root: "animation", type: "timing", children: [{ root: "animation", type: "property", args: { key: "duration", value: "1s" } }] },
        ctx(),
        { root: "animation", type: "animation", args: { name } },
      ),
    );
    const value = css.slice(css.indexOf(":", css.indexOf("--theme-animation")) + 1, css.lastIndexOf(";"));
    expect(identValues(value)).toEqual([name]);
    expect(identValues(preludeOf(screenKeyframes(name)).replace("@keyframes", ""))).toEqual([name]);
  });
});

describe("the selector translator writes a declarable name as the one escape does (#2176)", () => {
  const DECLARABLE = ["card", "card_2", "my-card", "_x", "x1", "card@night", "mia@night_2", "a@b@c", "card-2@dim"];

  it.each(DECLARABLE)("writes the class %s as escapeCssIdentifier does", (name) => {
    expect(getCSSSelector(name, {})).toBe(`.${escapeCssIdentifier(name)}`);
  });

  it.each(DECLARABLE)("writes the attribute value %s as escapeCssIdentifier does", (name) => {
    const css = getCSSSelector(`#image=${name}`, {});
    expect(css.endsWith(`=${escapeCssIdentifier(name)}]`), css).toBe(true);
  });
});

describe("the font theme variable names the family its font is loaded under (#2176)", () => {
  const SOURCE = `${NAMES.map(
    (name, i) => `define face${i} as font with
  src = "face${i}.woff2"
  font_family = "${name}"
end
`,
  ).join("\n")}
define plain as font with
  src = "plain.woff2"
end

style card {
  text-font = face0
}

layout main {
  box.card
}
`;
  let css = "";

  beforeAll(async () => {
    const h = createDOMHarness(SOURCE, 0, { autoOpenAll: true });
    await h.ready;
    await flushMicrotasks(20);
    css = [...h.overlay.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
  }, 60000);

  it.each(NAMES.map((name, i) => [name, i] as const))("declares the family %s as that one identifier", (name, i) => {
    expect(identValues(declarationOf(css, getVarName("font", `face${i}`))!)).toEqual([name]);
  });

  it("declares a font without a font_family under its own name", () => {
    expect(declarationOf(css, getVarName("font", "plain"))).toBe("plain");
  });
});

describe("a name of only letters and hyphens and authored CSS are written as before (#2176)", () => {
  it.each([
    ["@keyframes", () => keyframes(PLAIN), `@keyframes ${PLAIN} {`],
    ["@font-face", () => fontFace(PLAIN), `font-family: ${PLAIN};`],
    ["screen @keyframes", () => screenKeyframes(PLAIN), `@keyframes ${PLAIN} {`],
    ["screen theme", () => screenTheme(PLAIN), `:is([theme="${PLAIN}"],.theme-${PLAIN}) > * {`],
  ])("%s", (_, write, expected) => {
    expect(write()).toContain(expected);
  });

  it.each([
    ["animation_name", `${PLAIN},shaky_2`, `${PLAIN}, shaky_2`],
    ["animation", "0.5s infinite bounce", "0.5s infinite bounce"],
    ["animation", "-0.5s 250ms steps(4, end) 2 bounce", "-0.5s 250ms steps(4, end) 2 bounce"],
    ["animation", "\\70 ulse", "\\70 ulse"],
    ["text-font", "Georgia, serif", "Georgia, serif"],
    ["text-font", 'system-ui, -apple-system, "Segoe UI", Fira Code, sans-serif', 'system-ui, -apple-system, "Segoe UI", Fira Code, sans-serif'],
    ["text-font", "var(--font, serif)", "var(--font, serif)"],
  ])("%s %s", (property, value, expected) => {
    expect(valueOf(property, value)).toBe(expected);
  });
});
