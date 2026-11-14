import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function letterStyles(line: string): Promise<[string, CSSStyleDeclaration][]> {
  const src = `scene start\n  HERO: ${line}\nend\n`;
  const at = src.split("\n").findIndex((l) => l.includes(line));
  const h = createDOMHarness(src, at, { compose: true });
  await h.ready;
  await h.rerender(src, at);
  await flushMicrotasks(10);
  const text = h.overlay.querySelector(".dialogue > .text") as HTMLElement | null;
  return ([...(text?.querySelectorAll(".text_letter") ?? [])] as HTMLElement[]).map(
    (el) => [el.textContent ?? "", el.style],
  );
}

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

  test.each([
    ["<i>", "</i>", "font-style", /^italic$/],
    ["<u>", "</u>", "text-decoration-line", /^underline$/],
    ["<color:red>", "</color>", "color", /red/],
    ["<color:#ff0000>", "</color>", "color", /^(#ff0000|rgb\(255, 0, 0\))$/],
    ["<size:2rem>", "</size>", "font-size", /^2rem$/],
    ["<alpha:#80>", "</alpha>", "filter", new RegExp(`^opacity\\(${0x80 / 255}\\)$`)],
  ])("%s styles the letters it encloses", async (open, close, property, value) => {
    const shown = await letterStyles(`A ${open}word${close} here.`);
    const styled = shown.filter(([, style]) => value.test(style.getPropertyValue(property)));
    expect(
      styled.map(([text]) => text).join(""),
      shown.map(([text, style]) => `${text}: ${style.getPropertyValue(property)}`).join(", "),
    ).toBe("word");
  });

  test("a look tag in an inserted value styles the rest of the line", async () => {
    expect(await letters("Everyone calls you {nickname} around here.")).toEqual({
      text: "Everyone calls you Ace around here.",
      bold: "Ace around here.",
    });
  });
});
