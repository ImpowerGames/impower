import { describe, expect, test, vi } from "vitest";
import { UIModule } from "../../game/modules/ui/classes/UIModule";
import type { MorphStillParams } from "../../game/modules/ui/classes/messages/MorphStillMessage";

describe("a picture that stays still because of an SVG layer file names the file and says why (#2631, #2757)", () => {
  test.for([
    ["unsized", "is an SVG with neither a viewBox nor a width and height of its own, so it cannot be fitted to the picture"],
    ["undrawn", "is an SVG the browser would not draw at the picture's size"],
    ["framed", "is an SVG whose root has padding or a border, which browsers do not draw alike on a canvas"],
  ] as const)("%s", ([reason, why]) => {
    const log = vi.fn();
    const ui = { _morphStills: new Set<string>(), _game: { log } };
    const params: MorphStillParams = { image: "kit", file: "brows.svg", reason };
    UIModule.prototype.reportMorphStill.call(ui as never, params);
    UIModule.prototype.reportMorphStill.call(ui as never, params);
    expect(log.mock.calls).toEqual([[`\`kit\` stays still: its layer file \`brows.svg\` ${why}, and no morph plays on it.`, "warning"]]);
  });
});
