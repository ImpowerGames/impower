// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEditorGlobalCss } from "../../vite.config";

const LAYOUT_PROPERTIES = [
  "flex-shrink",
  "flex-direction",
  "flex-flow",
  "min-width",
  "max-width",
];

const declarationsBySelector = (css: string) => {
  const found: { selector: string; property: string }[] = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]!.trim().replace(/\s+/g, " ");
    for (const declaration of match[2]!.split(";")) {
      const property = declaration.split(":")[0]!.trim().toLowerCase();
      if (property) {
        found.push({ selector, property });
      }
    }
  }
  return found;
};

describe("editor document global CSS", () => {
  it("leaves flex and size layout to Tailwind's preflight", () => {
    const layoutDeclarations = declarationsBySelector(
      readEditorGlobalCss(),
    ).filter(({ property }) => LAYOUT_PROPERTIES.includes(property));

    expect(layoutDeclarations).toEqual([]);
  });
});
