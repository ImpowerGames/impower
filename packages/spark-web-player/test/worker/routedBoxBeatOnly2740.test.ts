import { expect, test } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `scene start
  First.
  HERO: Original.
  HERO: Unchanged.
end
`;

test("an edit that turns a line into the kind before it shows the edited text once its box has mounted (I-2740)", async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: 2 },
  });
  try {
    await h.compile();
    await h.select(2);
    await settle(40);
    const game: any = h.workerState.gameState.game!;
    const frame = h.overlay.querySelector(".screen_textbox");
    expect(frame).not.toBeNull();
    expect(h.overlay.textContent).toContain("Original.");
    let release!: () => void;
    const fonts = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prepare = game.module.assets.prepareLayout.bind(game.module.assets);
    let waited = 0;
    game.module.assets.prepareLayout = (name: string) => {
      if (name === "action") {
        waited += 1;
        return fonts;
      }
      return prepare(name);
    };
    await h.edit([
      {
        range: { start: { line: 2, character: 2 }, end: { line: 2, character: 17 } },
        text: "Edited action.",
      },
    ]);
    const compiling = h.compile();
    await settle(40);
    release();
    await compiling;
    await settle(60);
    expect(waited).toBeGreaterThan(0);
    expect((h.workerState.player as any).lastDisplayPath?.()).toEqual({ beatOnly: true });
    expect(h.overlay.querySelector(".action")?.textContent).toContain("Edited action.");
  } finally {
    h.dispose();
  }
}, 120_000);
