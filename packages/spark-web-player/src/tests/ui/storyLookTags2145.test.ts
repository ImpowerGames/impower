import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function letters(line: string) {
  const src = `store nickname = "<b>Ace"\n\nscene start\n  HERO: ${line}\nend\n`;
  const at = src.split("\n").findIndex((l) => l.includes(line));
  const h = createDOMHarness(src, at, { compose: true });
  await h.ready;
  await h.rerender(src, at);
  await flushMicrotasks(10);
  const text = h.overlay.querySelector(".dialogue > .text") as HTMLElement | null;
  const shown = [...(text?.querySelectorAll(".text_letter") ?? [])] as HTMLElement[];
  return {
    text: text?.textContent ?? "",
    bold: shown
      .filter((el) => el.style.getPropertyValue("font-weight") === "700")
      .map((el) => el.textContent)
      .join(""),
  };
}

describe("a look tag in a story line styles the letters the player shows (#2145, #1491)", () => {
  test("A <b>word</b> here. shows word in bold", async () => {
    expect(await letters("A <b>word</b> here.")).toEqual({ text: "A word here.", bold: "word" });
  });

  test("an unknown tag is absent from the text", async () => {
    expect(await letters("A <b2>word</b2> here.")).toEqual({ text: "A word here.", bold: "" });
  });

  test("a look tag in an inserted value styles the rest of the line", async () => {
    expect(await letters("Everyone calls you {nickname} around here.")).toEqual({
      text: "Everyone calls you Ace around here.",
      bold: "Ace around here.",
    });
  });
});
