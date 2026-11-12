import { describe, expect, it } from "vitest";
import { getCssTokenValue } from "@impower/spark-dom/src/utils/getCssTokenValue";
import { getCSSSelector, getStyleContent } from "@impower/spark-dom/src/utils/getStyleContent";
import { getVarName } from "@impower/spark-engine/src/game/modules/ui/utils/getVarName";

const classed = (className: string) => {
  const element = document.createElement("div");
  element.className = className;
  return element;
};

describe("@ names in styles (#2109)", () => {
  it.each(["card@night", "card@hovered", "card_x@before"])("selects the element whose class is %s, and no other", (name) => {
    const selector = getCSSSelector(name, {});
    expect(classed(name).matches(selector)).toBe(true);
    expect(classed(name.split("@")[0]!).matches(selector)).toBe(false);
  });

  it("writes a style named with an @ as a selector of that class", () => {
    const css = getStyleContent({ "card@night": { opacity: 0.5 } }, { breakpoints: {}, theme: {} as never });
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const rule = style.sheet!.cssRules[0] as CSSStyleRule;
    expect(classed("card@night").matches(rule.selectorText)).toBe(true);
    expect(rule.style.getPropertyValue("opacity")).toBe("0.5");
  });

  it("keeps a state written on its own, after a state or after a name as a state", () => {
    expect(getCSSSelector("@hovered", {})).toBe(":hover");
    expect(getCSSSelector("@before", {})).toBe("::before");
    expect(getCSSSelector("@hovered @before", {})).toBe(":hover::before");
    expect(getCSSSelector("@hovered @before, @focused @before", {})).toBe(":hover::before,:focus::before");
    expect(getCSSSelector("button @hovered", {})).toBe(getCSSSelector("button", {}) + ":hover");
    expect(getCSSSelector("card@night @hovered", {})).toBe(getCSSSelector("card@night", {}) + ":hover");
  });

  it("gives an image named with an @ its own theme variable", () => {
    expect(getVarName("image", "mia@night")).not.toBe(getVarName("image", "mia-night"));
    expect(getVarName("image", "mia@night")).not.toBe(getVarName("image", "mia_night"));
    expect(getVarName("image", "mia-night")).toBe("--theme-image-mia-night");
    expect(getCssTokenValue({ $type: "image", $name: "mia@night" })).toBe(`var(${getVarName("image", "mia@night")})`);
  });
});
