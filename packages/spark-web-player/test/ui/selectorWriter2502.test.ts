import { describe, expect, it } from "vitest";
import { anchorSelfTargeted, getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import {
  ARGUMENT_CASES,
  AT_RULE_CASES,
  BREAKPOINTS,
  NAME_CASES,
  OBJECT_PROPERTY_NAME_CASES,
  PUNCTUATION_CASES,
  STANDARD_STATE_CASES,
} from "./selectorWriterCases2502";

const write = (selector: string) => getCSSSelector(selector, { ...BREAKPOINTS });

describe("the player's selector writer (#2502)", () => {
  it.each(STANDARD_STATE_CASES)("writes the standard state in %s as %s", (source, css) => {
    expect(write(source)).toBe(css);
  });

  it.each(ARGUMENT_CASES)("keeps the argument grammar of %s as %s", (source, css) => {
    expect(write(source)).toBe(css);
  });

  it.each(NAME_CASES)("reads the component names in %s as %s", (source, css) => {
    expect(write(source)).toBe(css);
  });

  it.each(PUNCTUATION_CASES)("keeps the punctuation of %s as %s", (source, css) => {
    expect(write(source)).toBe(css);
  });

  it.each(AT_RULE_CASES)("writes the at-rule %s as %s", (source, css) => {
    expect(write(source)).toBe(css);
  });

  it.each(OBJECT_PROPERTY_NAME_CASES)("reads %s as a name, not an object property, writing %s", (source, css) => {
    expect(write(source)).toBe(css);
  });

  it("anchors every state alternative of a nested rule to its element", () => {
    expect(anchorSelfTargeted(write("@hover, @focus-visible"))).toBe("&:hover, &:focus-visible");
  });

  it("selects the elements a standard state names", () => {
    const list = document.createElement("div");
    list.innerHTML = '<div class="card"></div><div class="card"></div><div class="card"></div>';
    const cards = [...list.children];
    expect(cards.map((e) => e.matches(write("card @first-child")))).toEqual([true, false, false]);
    expect(cards.map((e) => e.matches(write("card @nth-child(2n)")))).toEqual([false, true, false]);
    expect(cards.map((e) => e.matches(write("card @last-of-type")))).toEqual([false, false, true]);
  });

  it("finds and excludes components by name inside selector functions", () => {
    const list = document.createElement("div");
    list.innerHTML = '<div class="card"><span class="icon"></span></div><div class="note"></div>';
    const [card, note] = [...list.children];
    expect([card, note].map((e) => e!.matches(write("@not(card)")))).toEqual([false, true]);
    expect([card, note].map((e) => e!.matches(write("@has(icon)")))).toEqual([true, false]);
    expect([card, note].map((e) => e!.matches(write("@has(>icon)")))).toEqual([true, false]);
  });

  it("matches an attribute alternative and a component alternative of one list", () => {
    const list = document.createElement("div");
    list.innerHTML = '<div class="card"></div><div title="blue"></div><div></div>';
    const items = [...list.children];
    expect(items.map((e) => e.matches(write("@is(#title=blue, card)")))).toEqual([true, true, false]);
  });});
