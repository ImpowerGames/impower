import { describe, expect, test } from "vitest";
import { uiBuiltinDefinitions } from "../../spark-engine/src/game/modules/ui/uiBuiltinDefinitions";
import { createScreenRenderContext } from "../../sparkle-screen-preview/src/utils/createScreenRenderContext";
import { getComponents, parseSparkle, renderCssVDOM } from "../src";

const engineBreakpoints = uiBuiltinDefinitions().config.ui.breakpoints;

const renderStyle = (selector: string) => {
  const parsed = parseSparkle(`style card\n  ${selector}\n    color = red`);
  return JSON.stringify(
    renderCssVDOM(
      parsed,
      createScreenRenderContext(getComponents(parsed), {}, new Set()),
    ),
  );
};

describe("the screen preview resolves screen-size selectors against the engine's breakpoints", () => {
  test("@screen-size(sm) gates at 640px", () => {
    expect(renderStyle("@screen-size(sm)")).toContain(
      "@container screen (max-width:640px)",
    );
  });

  test.each(Object.entries(engineBreakpoints))(
    "@screen-size(%s) gates at %ipx",
    (name, px) => {
      expect(renderStyle(`@screen-size(${name})`)).toContain(
        `@container screen (max-width:${px}px)`,
      );
    },
  );
});
