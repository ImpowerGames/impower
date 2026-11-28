import { expect, test } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define raffles as character with
  name = "RAFFLES"
end

layout phone {
  thread {
    stream {
      dialogue.bubble {
        text
        continue_indicator { text = ▼ }
      }
    }
  }
}

stream phone {
  advance = auto
}

scene start
  [[open phone]]
  RAFFLES: one
  RAFFLES: two
  RAFFLES: three
  The street is empty.
end
`;

const LINES = SOURCE.split("\n");

test("a stream entry's node keeps no class, inline style or custom property an earlier display gave it (I-2744)", async () => {
  const first = LINES.indexOf("  RAFFLES: one");
  const third = LINES.indexOf("  RAFFLES: three");
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: third },
  });
  try {
    await h.compile();
    await h.select(third);
    await settle(40);
    const bubbles = () => [...h.overlay.querySelectorAll<HTMLElement>(".bubble")];
    const indicators = () =>
      bubbles().map((el) => el.querySelector<HTMLElement>(".continue_indicator")?.getAttribute("style") ?? "");
    expect(bubbles()).toHaveLength(3);
    const atThird = indicators();
    const game: any = h.workerState.gameState.game!;
    await game.module.ui.style.update("bubble", { "--glow": "1", outline: "1px solid red" });
    await game.module.ui.attributes.update("bubble", { class: "dialogue bubble lit" });
    await settle(20);
    expect(bubbles().every((el) => el.classList.contains("lit"))).toBe(true);
    expect(bubbles().every((el) => el.style.getPropertyValue("--glow") === "1")).toBe(true);

    await h.select(first);
    await settle(60);
    const look = () =>
      bubbles().map((el) => ({
        lit: el.classList.contains("lit"),
        glow: el.style.getPropertyValue("--glow"),
        outline: el.style.outline,
      }));
    expect(look().every((entry) => !entry.lit && !entry.glow && !entry.outline)).toBe(true);
    const atFirst = indicators();

    await h.select(third);
    await settle(60);
    expect(look().every((entry) => !entry.lit && !entry.glow && !entry.outline)).toBe(true);
    expect(indicators()).toEqual(atThird);

    await h.select(first);
    await settle(60);
    expect(indicators()).toEqual(atFirst);
  } finally {
    h.dispose();
  }
}, 180_000);
