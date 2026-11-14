import { compile, optimize } from "@tailwindcss/node";
import { render } from "preact";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { WheelPicker, type WheelOption } from "../src/components/wheel-picker/WheelPicker";

const OPTIONS: WheelOption[] = [
  { value: "", label: "As is", hint: "Default" },
  { value: "happy", label: "Happy" },
  { value: "sad", label: "Sad" },
  { value: "cross", label: "Cross" },
];

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

const SRC = resolve("src");

let host: HTMLDivElement;
let rules: StyleRule[];

const classesIn = (root: Element) =>
  [root, ...Array.from(root.querySelectorAll("*"))].flatMap((element) =>
    (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
  );

const matches = (element: Element, selector: string) => {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
};

const BACKSLASH = String.fromCharCode(92);

const escapeClass = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, (character) => `${BACKSLASH}${character}`);

const startsWithClass = (selector: string, name: string) => {
  const head = `.${escapeClass(name)}`;
  const next = selector.charAt(head.length);
  return selector.startsWith(head) && !/[\w-]/.test(next) && next !== BACKSLASH;
};

const flat =(values: string[]) => values.join(" ").replace(/\s+/g, "");

const declared = (element: Element, property: string) =>
  rules
    .filter(({ selector, style }) => style.getPropertyValue(property) !== "" && matches(element, selector))
    .map(({ style }) => style.getPropertyValue(property));

const declaredWhen = (element: Element, property: string, state: RegExp) =>
  rules
    .filter(
      ({ selector, style }) =>
        state.test(selector) &&
        style.getPropertyValue(property) !== "" &&
        Array.from(element.classList).some((name) => startsWithClass(selector, name)),
    )
    .map(({ style }) => style.getPropertyValue(property));

beforeAll(async () => {
  host = document.createElement("div");
  document.body.append(host);
  render(<WheelPicker label="Face" options={OPTIONS} value="happy" onChoose={() => {}} />, host);
  const input = readFileSync(join(SRC, "style.css"), "utf8");
  const compiler = await compile(input, { base: SRC, onDependency: () => {} });
  const css = optimize(compiler.build(classesIn(host)), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  rules = collectRules(style.sheet!.cssRules);
});

describe("the wheel's chosen row", () => {
  const band = () => host.querySelector("[data-wheel-band]");
  const wheel = () => host.querySelector('[role="listbox"]')!;
  const rows = () => Array.from(host.querySelectorAll('[role="option"]'));

  it("is an inset, rounded band tinted and ringed with the accent", () => {
    const element = band();
    expect(element).not.toBeNull();
    expect(element!.getAttribute("aria-hidden")).toBe("true");
    expect(declared(element!, "position")).toContain("absolute");
    expect(declared(element!, "pointer-events")).toContain("none");
    expect(declared(element!, "border-radius")).toContain("10px");
    expect(declared(element!, "inset-inline").join(" ")).toMatch(/var\(--spacing\)\s*\*\s*3/);
    expect(declared(element!, "height").join(" ")).toMatch(/var\(--spacing\)\s*\*\s*11/);
    expect(flat(declared(element!, "background-color"))).toContain("color-mix(insrgb,var(--accent)14%,transparent)");
    expect(flat(declared(element!, "outline-color"))).toContain("color-mix(insrgb,var(--accent)35%,transparent)");
  });

  it("turns its ring solid accent while the wheel has keyboard focus", () => {
    const solid = declaredWhen(band()!, "outline-color", /\.peer\)?:focus-visible/);
    expect(solid).toContain("var(--accent)");
  });

  it("is not painted on the scrolling wheel itself", () => {
    expect(declared(wheel(), "background-image")).toEqual([]);
    expect(declaredWhen(wheel(), "outline-color", /:focus-visible/)).toEqual([]);
  });

  it("leaves every row at 16px in ink with no change of weight", () => {
    const chosen = rows().find((row) => row.getAttribute("aria-selected") === "true")!;
    const other = rows().find((row) => row.getAttribute("aria-selected") === "false")!;
    for (const row of [chosen, other]) {
      expect(declared(row, "font-size")).toEqual(["16px"]);
      expect(declared(row, "color")).toEqual(["var(--ink)"]);
      expect(declared(row, "font-weight")).toEqual([]);
    }
  });

  it("fades rows towards both ends and tilts them as the prototype's drum does", () => {
    expect(declared(wheel(), "perspective")).toEqual(["520px"]);
    expect(declared(wheel(), "mask-image")).toEqual(["linear-gradient(#0000, #000 28% 72%, #0000)"]);
  });
});
