import { expect, test } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define raffles as character with
  name = "RAFFLES"
end

define bunny as character with
  name = "BUNNY"
end

scene start
  RAFFLES [left]:
    First left line.
  BUNNY [right]:
    First right line.
  A bell rings.
end
`;

const LINES = SOURCE.split("\n");

test("moving the preview from an exchange's first line to its second shows the second line (I-2744)", async () => {
  const first = LINES.indexOf("    First left line.");
  const second = LINES.indexOf("    First right line.");
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: first },
  });
  try {
    await h.compile();
    await h.select(first);
    await settle(40);
    const lines = () => [...h.overlay.querySelectorAll<HTMLElement>(".simultaneous_line")];
    expect(lines().map((el) => el.style.visibility)).toEqual(["", "hidden"]);
    await h.select(second);
    await settle(60);
    expect(lines().map((el) => el.textContent)).toEqual([
      expect.stringContaining("First left line."),
      expect.stringContaining("First right line."),
    ]);
    expect(lines().map((el) => el.style.visibility)).toEqual(["", ""]);
    expect(lines().map((el) => el.hasAttribute("data-latest"))).toEqual([false, true]);
    await h.select(first);
    await settle(60);
    expect(lines().map((el) => el.style.visibility)).toEqual(["", "hidden"]);
    expect(lines().map((el) => el.hasAttribute("data-latest"))).toEqual([true, false]);
  } finally {
    h.dispose();
  }
}, 120_000);
