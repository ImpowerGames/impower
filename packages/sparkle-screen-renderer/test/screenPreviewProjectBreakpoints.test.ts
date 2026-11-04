import { describe, expect, test } from "vitest";
import { uiBuiltinDefinitions } from "../../spark-engine/src/game/modules/ui/uiBuiltinDefinitions";
import { loadScreenPreview } from "../../sparkle-screen-preview/src/utils/loadScreenPreview";
import { getUiBreakpoints } from "../../sparkdown-language-server/src/utils/providers/getUiBreakpoints";
import { compileUI, createHarness } from "../../spark-engine/src/tests/ui/harness/uiTestHarness";

const SCENE = "\nscene start\n  A line.\nend\n";

const OVERRIDE = `define ui as config with
  breakpoints = { sm = 500, md = 900 }
end
`;

const projectBreakpoints = (source: string) =>
  getUiBreakpoints(compileUI(source).program);

const gameBreakpoints = async (source: string) => {
  const h = createHarness(source, 0);
  await h.ready;
  return (h.game.module.ui as any).breakpoints as Record<string, number>;
};

const previewCss = (
  selector: string,
  breakpoints: Record<string, number> | null,
) =>
  JSON.stringify(
    loadScreenPreview({
      text: `style card\n  ${selector}\n    color = red`,
      breakpoints,
    }).render({}).css,
  );

describe("the screen preview resolves breakpoints as the game does", () => {
  test("a project override reaches the preview at the override's widths", async () => {
    const source = OVERRIDE + SCENE;
    const project = projectBreakpoints(source);
    const game = await gameBreakpoints(source);
    expect(game).toMatchObject({ sm: 500, md: 900 });
    expect(project).toEqual(game);
    for (const [name, px] of Object.entries(game)) {
      expect(previewCss(`@screen-size(${name})`, project)).toContain(
        `@container screen (max-width:${px}px)`,
      );
    }
    expect(previewCss("@screen-size(sm)", project)).not.toContain(
      "max-width:640px",
    );
  });

  test("a project without an override keeps the builtin table", async () => {
    const project = projectBreakpoints(SCENE);
    const game = await gameBreakpoints(SCENE);
    const builtin = uiBuiltinDefinitions().config.ui.breakpoints;
    expect(game).toMatchObject(builtin);
    expect(project).toEqual(game);
    for (const [name, px] of Object.entries(builtin)) {
      expect(previewCss(`@screen-size(${name})`, project)).toContain(
        `@container screen (max-width:${px}px)`,
      );
    }
  });
});
