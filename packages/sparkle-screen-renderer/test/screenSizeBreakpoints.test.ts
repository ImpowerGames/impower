import { describe, expect, test } from "vitest";
import { uiBuiltinDefinitions } from "../../spark-engine/src/game/modules/ui/uiBuiltinDefinitions";
import { parseSparkle, renderCssVDOM } from "../src";

const breakpoints = uiBuiltinDefinitions().config.ui.breakpoints;

const renderStyle = (selector: string) =>
  JSON.stringify(
    renderCssVDOM(parseSparkle(`style card\n  ${selector}\n    color = red`), {
      components: {},
      state: {},
      options: { breakpoints },
    }),
  );

describe("a screen-size selector resolves against the engine's breakpoints", () => {
  test("@screen-size(sm) gates at 640px", () => {
    expect(renderStyle("@screen-size(sm)")).toContain(
      "@container screen (max-width:640px)",
    );
  });

  test.each(Object.entries(breakpoints))(
    "@screen-size(%s) gates at %ipx",
    (name, px) => {
      expect(renderStyle(`@screen-size(${name})`)).toContain(
        `@container screen (max-width:${px}px)`,
      );
    },
  );
});
