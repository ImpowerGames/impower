import { isTokenCloseCurly, isTokenFunction, isTokenIdent, isTokenOpenCurly, isTokenSemicolon, isTokenWhitespace, tokenize } from "@csstools/css-tokenizer";
import { beforeAll, describe, expect, it } from "vitest";
import { getAnimationContent } from "@impower/spark-dom/src/utils/getAnimationContent";
import { getCssTokenValue } from "@impower/spark-dom/src/utils/getCssTokenValue";
import { getStyleContent } from "@impower/spark-dom/src/utils/getStyleContent";
import { getVarName } from "@impower/spark-engine/src/game/modules/ui/utils/getVarName";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { escapeCssIdentifier } from "../../../../sparkle-style-transformer/src/utils/themeVariableName";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const tokens = (css: string) => tokenize({ css });
const identValues = (css: string) => tokens(css).filter(isTokenIdent).map((token) => token[4].value);
const varTarget = (value: string) => {
  const list = tokens(value);
  const at = list.findIndex((token) => isTokenFunction(token) && token[4].value === "var");
  return at < 0 ? undefined : identValues(value.slice(list[at]![3] + 1))[0];
};

const declarationsOf = (css: string): Map<string, string> => {
  const found = new Map<string, string>();
  let depth = 0;
  let start = 0;
  const flush = (end: number) => {
    const text = css.slice(start, end);
    const list = tokens(text).filter((token) => !isTokenWhitespace(token));
    const name = list[0];
    const colon = name ? text.indexOf(":", name[3] + 1) : -1;
    if (name && isTokenIdent(name) && colon >= 0) found.set(name[4].value, text.slice(colon + 1).trim());
  };
  for (const token of tokens(css)) {
    if (isTokenOpenCurly(token)) {
      depth += 1;
      start = token[3] + 1;
    } else if (isTokenCloseCurly(token)) {
      flush(token[2]);
      depth -= 1;
      start = token[3] + 1;
    } else if (isTokenSemicolon(token) && depth > 0) {
      flush(token[2]);
      start = token[3] + 1;
    }
  }
  return found;
};

const DISTINCT = ["a-b", "a--b", "a.b", "a~b", "a b", "a@b"];
const TYPES = ["image", "color", "ease", "font"];

describe("a theme variable name keeps the declared name (#2137)", () => {
  it.each(TYPES)("gives each of a-b, a--b, a.b, a~b, a b and a@b its own %s variable", (type) => {
    expect(new Set(DISTINCT.map((name) => getVarName(type, name))).size).toBe(DISTINCT.length);
  });

  it.each(DISTINCT)("writes the variable of %s as one CSS identifier that reads back as that variable", (name) => {
    const variable = getVarName("image", name);
    const list = tokens(escapeCssIdentifier(variable));
    expect(list.filter((token) => !isTokenWhitespace(token)).length).toBe(2);
    expect(identValues(escapeCssIdentifier(variable))).toEqual([variable]);
  });

  it("sorts the attributes after the first ~", () => {
    expect(getVarName("image", "b~y~x")).toBe(getVarName("image", "b~x~y"));
    expect(getVarName("image", "x~b~y")).not.toBe(getVarName("image", "b~x~y"));
  });

  it.each(["a-b", "mia_night", "sky_40", "neutral-20", "a1"])("keeps the variable of %s", (name) => {
    expect(getVarName("color", name)).toBe(`--theme-color-${name}`);
    expect(escapeCssIdentifier(getVarName("color", name))).toBe(`--theme-color-${name}`);
  });

  it.each(
    [
      ["image", "background-image", "background-image"],
      ["color", "color", "color"],
      ["color", "background-color", "background-color"],
      ["ease", "animation-easing", "animation-timing-function"],
      ["font", "text-font", "font-family"],
    ].flatMap(([type, property, css]) => [...DISTINCT, "1a", "-", "étoile", "a(b)"].map((name) => [type!, property!, name, css!])),
  )("refers a %s's %s of %s to its variable from a script token and from a style", (type, property, name, css) => {
    const variable = getVarName(type, name);
    const theme = new Set([variable]);
    const named = getCssEquivalent(property, name, theme).find(([key]) => key === css)?.[1];
    const referenced = getCssEquivalent(property, getCssTokenValue({ $type: type, $name: name }), theme).find(([key]) => key === css)?.[1];
    expect(varTarget(named ?? "")).toBe(variable);
    expect(varTarget(referenced ?? "")).toBe(variable);
  });

  it.each(DISTINCT)("declares the variable of %s in a stylesheet under that variable", (name) => {
    const variable = getVarName("image", name);
    const css = getStyleContent({ "": { [variable]: "url(x.svg)" } }, { breakpoints: {}, theme: new Set() });
    expect(declarationsOf(css).get(variable)).toBe("url(x.svg)");
  });

  it.each(DISTINCT)("declares the variable of %s in a keyframe under that variable", (name) => {
    const variable = getVarName("color", name);
    const css = getAnimationContent({ fade: { keyframes: [{ [variable]: "red" }] } as never }, new Set());
    expect(declarationsOf(css).get(variable)).toBe("red");
  });
});

const image = (name: string, file: string) => ({
  uri: `inmemory:///${file}.svg`,
  type: "image",
  name,
  ext: "svg",
  src: `/file:/${file}.svg`,
  version: 1,
});

const IMAGES = [
  image("hero", "hero"),
  image("mia.night", "mia-dot-night"),
  image("mia@night", "mia-at-night"),
  image("a-b", "hyphen"),
  image("a~b", "tilde"),
  image("a.b", "dot"),
  image("hero(night)", "hero-paren-night"),
];

const SOURCE = `style hero_named {
  background-image = hero
}

style hero_referenced {
  background_image = image.hero
}

style at_named {
  background-image = mia@night
}

style at_referenced {
  background_image = image.mia@night
}

style paren_named {
  background-image = "hero(night)"
}

define red@dim as color with
  value = "rgb(4, 5, 6)"
end

layout main {
  box.hero_named
  box.hero_referenced
  box.at_named
  box.at_referenced
  box.paren_named
  box.inline_override #--theme-color-red@dim="rgb(1, 2, 3)" #color=red@dim
}



scene start
  Shown.
end
`;

let declared = new Map<string, string>();
let css = "";
let inlineStyle = "";

const backgroundOf = (className: string): string | undefined => {
  const open = css.indexOf(`.${className} {`);
  return open < 0 ? undefined : declarationsOf(css.slice(open + className.length + 2, css.indexOf("}", open) + 1)).get("background-image");
};

beforeAll(async () => {
  const h = createDOMHarness(SOURCE, 0, { autoOpenAll: true, files: IMAGES });
  await h.ready;
  await flushMicrotasks(20);
  css = [...h.overlay.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
  inlineStyle = h.overlay.querySelector(".inline_override")?.getAttribute("style") ?? "";
  declared = declarationsOf(css);
}, 60000);

describe("a style and a script reach the image variable the engine publishes (#2137)", () => {
  it("publishes a-b, a~b and a.b as three variables, each holding its own image", () => {
    const published = ["a-b", "a~b", "a.b"].map((name) => declared.get(getVarName("image", name)));
    expect(published).toEqual(['url("/file:/hyphen.svg")', 'url("/file:/tilde.svg")', 'url("/file:/dot.svg")']);
  });

  it.each([
    ["hero", 'url("/file:/hero.svg")'],
    ["mia.night", 'url("/file:/mia-dot-night.svg")'],
    ["mia@night", 'url("/file:/mia-at-night.svg")'],
  ])("publishes %s under its own variable", (name, value) => {
    expect(declared.get(getVarName("image", name))).toBe(value);
  });

  it.each([
    ["hero", "hero_named", "hero_referenced"],
    ["mia@night", "at_named", "at_referenced"],
  ])("refers a style naming %s and a script value referring to it to its published variable", (name, named, referenced) => {
    const variable = getVarName("image", name);
    expect(declared.get(variable), `${variable} is not declared`).toBeTruthy();
    expect(varTarget(backgroundOf(named) ?? "")).toBe(variable);
    expect(varTarget(backgroundOf(referenced) ?? "")).toBe(variable);
  });

  it("refers a style naming an image whose name holds parentheses to its published variable", () => {
    const variable = getVarName("image", "hero(night)");
    expect(declared.get(variable)).toBe('url("/file:/hero-paren-night.svg")');
    expect(varTarget(backgroundOf("paren_named") ?? "")).toBe(variable);
  });

  it("writes an element's own declaration of an @ color's variable under that variable", () => {
    const variable = getVarName("color", "red@dim");
    const written = declarationsOf(`{${inlineStyle}}`);
    expect(written.get(variable)).toBe("rgb(1, 2, 3)");
    expect(varTarget(written.get("color") ?? "")).toBe(variable);
  });
});
