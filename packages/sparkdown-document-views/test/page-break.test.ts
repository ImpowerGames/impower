import { describe, expect, it } from "vitest";
import { renderPreview } from "./helpers/renderPreview";

describe("page break — explicit (Scene / Function / Knot) decoration", () => {
  it("$:-prefixed scene heading renders inline (no <hr>), action lines intact", () => {
    const source =
      `Action before.\n` +
      `\n` +
      `$: INT. CASINO - NIGHT\n` +
      `\n` +
      `Action after.\n`;
    const r = renderPreview(source);
    expect(r.contentHTML.includes("Action before.")).toBe(true);
    expect(r.contentHTML.includes("INT. CASINO - NIGHT")).toBe(true);
    expect(r.contentHTML.includes("Action after.")).toBe(true);
    expect(r.contentHTML.includes("<hr>")).toBe(false);
  });

  it("`scene` keyword form inserts an <hr> widget", () => {
    const source =
      `Action before.\n` +
      `\n` +
      `scene CasinoNight\n` +
      `  Bunny enters.\n` +
      `\n` +
      `Action after.\n`;
    const r = renderPreview(source);
    expect(r.contentHTML.includes("Action before.")).toBe(true);
    expect(r.contentHTML.includes("Action after.")).toBe(true);
    expect(r.contentHTML.includes("<hr>")).toBe(true);
  });
});
