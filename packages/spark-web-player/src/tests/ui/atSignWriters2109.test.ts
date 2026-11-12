import { isTokenAtKeyword, isTokenCloseCurly, isTokenFunction, isTokenIdent, isTokenOpenCurly, isTokenSemicolon, tokenize } from "@csstools/css-tokenizer";
import { beforeAll, describe, expect, it } from "vitest";
import { createImageElement } from "@impower/spark-dom/src/utils/createImageElement";
import { getAnimationContent } from "@impower/spark-dom/src/utils/getAnimationContent";
import { getFontContent } from "@impower/spark-dom/src/utils/getFontContent";
import { getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import { getVarName } from "@impower/spark-engine/src/game/modules/ui/utils/getVarName";
import { getResourcePathFromUrl, getResourceSrcFromPath } from "@impower/sparkdown/src/workspace/utils/resourceUrl";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getThemeVar } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { compile, createDOMHarness, flushMicrotasks } from "./domTestHarness";

const IMAGE = { uri: "inmemory:///mia@night.svg", type: "image", name: "mia@night", ext: "svg", src: "/file:/mia%40night.svg", version: 1 };

const SOURCE = `define red@dim as color with
  value = "rgb(200,0,0)"
end

define snap@soft as ease with
  ["function"] = "cubic-bezier"
  parameters = { 0.1, 0, 0, 1 }
end

define serif@bold as font with
  src = "serif@bold.woff2"
end

animation fade@night {
  keyframes {
    from { opacity = "0" }
    to { opacity = "1" }
  }
  timing { duration = 0.4 }
}

style card@night {
  background-color = red@dim
  text-font = serif@bold
  animation = fade@night
  animation_name = fade@night
  animation-easing = snap@soft
  background-image = mia@night
}

style menu@pause {
  opacity = 0.9
}

layout menu@pause {
  box.card@night
}

layout main {
  box.card@night
}
`;

const NAMES = ["red@dim", "snap@soft", "serif@bold", "fade@night", "card@night", "menu@pause", "mia@night"];

type Rule = { prelude: string; declarations: Map<string, string> };

const tokens = (css: string) => tokenize({ css });

const declarationsOf = (block: string): Map<string, string> => {
  const found = new Map<string, string>();
  let depth = 0;
  let start = 0;
  const flush = (end: number) => {
    const text = block.slice(start, end);
    const colon = text.indexOf(":");
    if (!text.includes("{") && colon > 0) found.set(text.slice(0, colon).trim(), text.slice(colon + 1).trim());
  };
  for (const token of tokens(block)) {
    if (isTokenOpenCurly(token)) depth += 1;
    else if (isTokenCloseCurly(token)) {
      depth -= 1;
      if (depth === 0) start = token[3] + 1;
    } else if (isTokenSemicolon(token) && depth === 0) {
      flush(token[2]);
      start = token[3] + 1;
    }
  }
  flush(block.length);
  return found;
};

const rulesOf = (text: string): Rule[] => {
  const found: Rule[] = [];
  let depth = 0;
  let preludeStart = 0;
  let blockStart = 0;
  for (const token of tokens(text)) {
    if (isTokenOpenCurly(token)) {
      if (depth === 0) blockStart = token[3] + 1;
      depth += 1;
    } else if (isTokenCloseCurly(token)) {
      depth -= 1;
      if (depth === 0) {
        const open = text.lastIndexOf("{", blockStart);
        found.push({ prelude: text.slice(preludeStart, open).trim(), declarations: declarationsOf(text.slice(blockStart, token[2])) });
        preludeStart = token[3] + 1;
      }
    } else if (isTokenSemicolon(token) && depth === 0) {
      preludeStart = token[3] + 1;
    }
  }
  return found;
};
const identValues = (css: string) => tokens(css).filter(isTokenIdent).map((token) => token[4].value);
const atKeywordValues = (css: string) => tokens(css).filter(isTokenAtKeyword).map((token) => token[4].value);
const varTarget = (value: string) => {
  const list = tokens(value);
  const at = list.findIndex((token) => isTokenFunction(token) && token[4].value === "var");
  return at < 0 ? undefined : identValues(value.slice(list[at]![3] + 1))[0];
};

let css = "";
let rules: Rule[] = [];
let overlay: HTMLElement;
let fontFamily: unknown;

const SCOPE = "spark-web-player #game ";
const unscoped = (selector: string) => (selector.startsWith(SCOPE) ? selector.slice(SCOPE.length) : selector);
const matches = (element: Element, prelude: string) => {
  try {
    return !prelude.startsWith("@") && element.matches(unscoped(prelude));
  } catch {
    return false;
  }
};
const ruleFor = (element: Element, property: string) =>
  rules.find((rule) => rule.declarations.has(property) && matches(element, rule.prelude));
const declared = (property: string) => rules.find((rule) => rule.declarations.has(property))?.declarations.get(property);

beforeAll(async () => {
  const h = createDOMHarness(SOURCE, 0, { autoOpenAll: true, files: [IMAGE] });
  await h.ready;
  await flushMicrotasks(20);
  overlay = h.overlay;
  const sheets = [...overlay.querySelectorAll("style")];
  css = sheets.map((style) => style.textContent ?? "").join("\n");
  rules = sheets.flatMap((style) => rulesOf(style.textContent ?? ""));
  fontFamily = compile(SOURCE, [IMAGE]).context?.["font"]?.["serif@bold"]?.["font_family"];
}, 60000);

describe("an @ name reaches every stylesheet writer whole (#2109)", () => {
  it("leaves no @ name split by the CSS tokenizer anywhere in the emitted stylesheets", () => {
    const fragments = NAMES.map((name) => name.slice(name.indexOf("@") + 1));
    expect(atKeywordValues(css).filter((value) => fragments.includes(value))).toEqual([]);
    const idents = new Set(identValues(css));
    const variables = ["color", "ease", "font", "image"].flatMap((type) => NAMES.map((name) => getVarName(type, name)));
    expect(NAMES.filter((name) => !idents.has(name) && !variables.some((variable) => variable.endsWith(`-${name.replace("@", "--")}`) && idents.has(variable)))).toEqual([]);
  });

  it.each([
    ["style", "card@night", "background-color"],
    ["layout root", "menu@pause", "opacity"],
  ])("applies the %s %s's rule to the element of that class", (_, name, property) => {
    const element = overlay.getElementsByClassName(name)[0];
    expect(element, `no element of class ${name}`).toBeDefined();
    const rule = ruleFor(element!, property);
    expect(rule, `no rule with ${property} matches .${name}`).toBeDefined();
    expect(identValues(rule!.prelude)).toContain(name);
  });

  it("names the animation's @keyframes rule as the style's animation and animation-name refer to it", () => {
    const preludes = rules.filter((rule) => rule.prelude.startsWith("@keyframes")).map((rule) => identValues(rule.prelude));
    expect(preludes).toContainEqual(["fade@night"]);
    const card = ruleFor(overlay.getElementsByClassName("card@night")[0]!, "animation")!;
    expect(identValues(card.declarations.get("animation")!)).toContain("fade@night");
    expect(identValues(card.declarations.get("animation-name")!)).toEqual(["fade@night"]);
  });

  it.each([
    ["color", "red@dim", "background-color"],
    ["ease", "snap@soft", "animation-timing-function"],
    ["font", "serif@bold", "font-family"],
    ["image", "mia@night", "background-image"],
  ])("declares the %s %s's theme variable and refers to that variable", (type, name, property) => {
    const variable = getVarName(type, name);
    expect(declared(variable), `${variable} is not declared`).toBeTruthy();
    const card = ruleFor(overlay.getElementsByClassName("card@night")[0]!, property)!;
    expect(varTarget(card.declarations.get(property)!)).toBe(variable);
  });

  it("gives the font's theme variable the family the font is loaded under, its font_family or else its name", () => {
    const loadedAs = fontFamily || "serif@bold";
    expect(identValues(declared(getVarName("font", "serif@bold"))!)).toEqual([loadedAs]);
  });

  it("writes an @ font's family into @font-face as that one name", () => {
    const face = rulesOf(getFontContent({ "serif@bold": { font_family: "serif@bold", src: "a.woff2" } }))[0]!;
    expect(face.prelude).toBe("@font-face");
    expect(identValues(face.declarations.get("font-family")!)).toEqual(["serif@bold"]);
  });

  it("resolves an @ color with an alpha to that color's variable", () => {
    const theme = new Set([getVarName("color", "red@dim")]);
    const [[, value]] = getCssEquivalent("background-color", "red@dim/0.5", theme) as [[string, string]];
    expect(varTarget(value)).toBe(getVarName("color", "red@dim"));
  });

  it.each([
    ["#image=mia@night", "mia@night"],
    ["#image^=mia@", "mia@night"],
    ["#image$=@night", "mia@night"],
    ["#image~=mia@night", "mia@night bg"],
  ])("selects the image layer named by %s", (selector, names) => {
    const css = getCSSSelector(selector, {});
    expect(atKeywordValues(css)).toEqual([]);
    const layer = createImageElement(document.body, "background-image", "none", names, undefined, () => {});
    expect(layer.matches(css)).toBe(true);
    layer.remove();
  });
});

describe("an @ name inside a CSS function value is read whole (#2109)", () => {
  const theme = new Set([getVarName("color", "top@dim"), getVarName("color", "red@dim"), getVarName("color", "red")]);
  const valueOf = (property: string, value: string) => (getCssEquivalent(property, value, theme) as [[string, string]])[0][1];

  it.each([
    ["a gradient whose @ color starts with a direction keyword", "background-image", "linear-gradient(top@dim, white)", "top@dim"],
    ["a relative color's @ origin", "background-color", "rgb(from red@dim r g b / 0.5)", "red@dim"],
  ])("resolves %s to that color's variable", (_, property, value, name) => {
    expect(varTarget(valueOf(property, value))).toBe(getVarName("color", name));
  });

  it.each([
    ["animation", "var(--anim, fade@night)", "fade@night"],
    ["text-font", "var(--font, serif@bold)", "serif@bold"],
    ["text-font", "serif@bold", "serif@bold"],
  ])("writes the @ name in %s %s as one identifier", (property, value, name) => {
    const css = valueOf(property, value);
    expect(atKeywordValues(css)).toEqual([]);
    expect(identValues(css)).toContain(name);
  });

  it.each([
    ["background-image", "linear-gradient(top, white)", "linear-gradient(top, white)"],
    ["background-color", "rgb(from red r g b / 0.5)", "rgb(from var(--theme-color-red) r g b / 0.5)"],
    ["animation", "var(--anim, fade)", "var(--anim, fade)"],
    ["text-font", "var(--font, serif)", "var(--font, serif)"],
    ["text-font", "serif", "serif"],
  ])("writes %s %s without an @ as before", (property, value, expected) => {
    expect(valueOf(property, value)).toBe(expected);
  });
});

describe("an @ name gets output distinct from the same name with _ or - (#2109)", () => {
  const theme = new Set<string>();
  const writers: [string, (name: string) => string][] = [
    ["getVarName", (name) => getVarName("image", name)],
    ["getThemeVar", (name) => (getThemeVar(new Set([getVarName("color", name)]), "color", name) ?? "")],
    ["getCSSSelector", (name) => getCSSSelector(name, {})],
    ["@keyframes", (name) => getAnimationContent({ [name]: { keyframes: [{ opacity: 1 }] } as never }, theme)],
    ["@font-face", (name) => getFontContent({ [name]: { font_family: name, src: "a.woff2" } })],
  ];
  it.each(writers)("%s", (_, write) => {
    const outputs = ["mia@night", "mia_night", "mia-night"].map(write);
    expect(new Set(outputs).size).toBe(3);
  });

  it("writes a name without an @ as before", () => {
    expect(getFontContent({ mia_night: { font_family: "mia_night" } })).toContain("font-family: mia_night;");
    expect(getVarName("image", "mia_night")).toBe("--theme-image-mia_night");
    expect(getThemeVar(new Set(["--theme-color-red"]), "color", "red")).toBe("var(--theme-color-red)");
    expect(getAnimationContent({ fade: { keyframes: [{ opacity: 1 }] } as never }, theme)).toContain("@keyframes fade {");
  });
});

describe("an @ asset file name survives a URI round trip (#2109)", () => {
  const workspace = SparkdownWorkspace.prototype;
  const ASSETS = ["mia@night.svg", "mia@night.png", "theme@night.mp3", "intro@night.mp4", "serif@bold.woff2", "chapter@night.sd"];
  it.each(ASSETS.flatMap((file) => [`file:///proj/assets/${file}`, `file:///proj/assets/${file.replace("@", "%40")}`]))("reads, renames and reads again %s", (uri) => {
    const name = workspace.getFileName.call(workspace, uri);
    expect(name).toBe(uri.split("/").pop()!.split(".")[0]!.replace("%40", "@"));
    const renamed = workspace.getRenamedUri.call(workspace, uri, "day@two");
    expect(workspace.getFileName.call(workspace, renamed)).toBe("day@two");
    expect(renamed.slice(renamed.lastIndexOf("."))).toBe(uri.slice(uri.lastIndexOf(".")));
    expect(workspace.getRenamedUri.call(workspace, renamed, name)).toBe(uri.replace("%40", "@"));
  });

  it.each(ASSETS)("serves %s at a resource URL that reads back as its path", (file) => {
    const path = `proj/assets/${file}`;
    expect(getResourcePathFromUrl(getResourceSrcFromPath(path))).toBe(path);
  });
});
