import { describe, expect, it } from "vitest";
import { renderPreview } from "./helpers/renderPreview";

const choiceLine = (text: string) => {
  const r = renderPreview(`scene start\n  choose\n    + ${text}\n      done\n  end\nend\n`);
  return r.lines.find((line) => line.text.includes("Go"))!;
};

describe("a centered span in choice text", () => {
  it.each([
    ["choice text", "Go ^far away^"],
    ["a suppression", "Go [^far away^] now"],
    ["the text after a suppression", "Go [x] ^far away^"],
    ["choice text around an interpolation read as a unit", "Go ^far {#{{{{1}}}}} away^"],
  ])("is centered in the screenplay preview in %s, as on a display line", (_where, text) => {
    expect(choiceLine(text).html).toContain("text-align: center");
  });

  it("leaves choice text without one uncentered", () => {
    expect(choiceLine("Go far away").html).not.toContain("text-align: center");
  });
});
