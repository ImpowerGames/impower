import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

describe("preview a UI-only reactive layout emits no ink flow error", () => {
  const previewClean = async (label: string, src: string) => {
    const errs: string[] = [];
    const h = createHarness(src);
    (h.game.story as any).onError = (m: string) => errs.push(m);
    await h.ready;
    await h.preview(0);
    expect(errs, `${label} produced ink errors`).toEqual([]);
  };

  test("interpolation prop binding", async () => {
    await previewClean(
      "prop",
      `store email = ""\nlayout main with\n  input #value={email}\nend\n`,
    );
  });

  test("inline @event handler closure", async () => {
    await previewClean(
      "handler",
      `store email = ""\nlayout main with\n  input #value={email} @input={ email = event.value }\nend\n`,
    );
  });

  test("text interpolation in a nested column", async () => {
    await previewClean(
      "text",
      `store hp = 5\nlayout main with\n  column #child-gap=8 {\n    text "HP: {hp}"\n    button "Go"\n  }\nend\n`,
    );
  });
});
