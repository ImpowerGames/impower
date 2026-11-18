import { describe, expect, it } from "vitest";
import { getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import {
  isKnownSelectorState,
  KNOWN_SELECTOR_STATES,
  SELECTOR_STATE_ALIASES,
} from "../../../../sparkdown/src/compiler/constants/selectorStates";

const APPLIED: readonly [name: string, source: string, css: string][] = [
  ["theme", "@theme(dark)", ':where([data-color-scheme="dark"]) &'],
  ["hovered", "@hovered", ":hover"],
  ["focused", "@focused", ":focus"],
  ["pressed", "@pressed", ":active"],
  ["disabled", "@disabled", ":disabled"],
  ["enabled", "@enabled", ":enabled"],
  ["checked", "@checked", ":checked"],
  ["unchecked", "@unchecked", ":not(:checked)"],
  ["required", "@required", ":required"],
  ["indeterminate", "@indeterminate", ":indeterminate"],
  ["type_color", "@type_color", '[type="color"]'],
  ["type_date", "@type_date", '[type="date"]'],
  ["type_time", "@type_time", '[type="time"]'],
  ["type_submit", "@type_submit", '[type="submit"]'],
  ["type_reset", "@type_reset", '[type="reset"]'],
  ["type_button", "@type_button", '[type="button"]'],
  ["valid", "@valid", ":valid"],
  ["invalid", "@invalid", ":invalid"],
  ["readonly", "@readonly", ":read-only"],
  ["first", "@first", ":first-child"],
  ["last", "@last", ":last-child"],
  ["only", "@only", ":only-child"],
  ["odd", "@odd", ":nth-child(odd)"],
  ["even", "@even", ":nth-child(even)"],
  ["blank", "@blank", ":placeholder-shown"],
  ["direction", "@direction(rtl)", ":dir(rtl)"],
  ["language", "@language(en)", ":lang(en)"],
  ["before", "@before", "::before"],
  ["after", "@after", "::after"],
  ["placeholder", "@placeholder", "::placeholder"],
  ["selection", "@selection", "::selection"],
  ["marker", "@marker", "::marker"],
  ["backdrop", "@backdrop", "::backdrop"],
  ["opened", "@opened", "[open]"],
  ["track", "@track", "::-webkit-slider-runnable-track"],
  ["thumb", "@thumb", "::-webkit-slider-thumb"],
  ["bar", "@bar", "::-webkit-progress-bar"],
  ["fill", "@fill", "::-webkit-progress-value"],
  ["file_button", "@file_button", "::file-selector-button"],
  ["file-button", "@file-button", "::file-selector-button"],
  ["picker", "@picker", "::-webkit-calendar-picker-indicator"],
  ["swatch", "@swatch", "::-webkit-color-swatch"],
  ["swatch_wrapper", "@swatch_wrapper", "::-webkit-color-swatch-wrapper"],
  ["swatch-wrapper", "@swatch-wrapper", "::-webkit-color-swatch-wrapper"],
  ["busy", "@busy", '[aria-busy="true"]'],
  ["container-size", "@container-size(sm)", "@container(max-width:640px)"],
  ["container_size", "@container_size(sm)", "@container(max-width:640px)"],
  ["screen-size", "@screen-size(sm)", "@container screen (max-width:640px)"],
  ["screen_size", "@screen_size(sm)", "@container screen (max-width:640px)"],
  ["initial", "@initial", "@starting-style"],
  ["container", "@container (min-width: 1px)", "@container(min-width:1px)"],
  ["layer", "@layer", "@layer"],
  ["media", "@media (min-width: 1px)", "@media(min-width:1px)"],
  ["scope", "@scope (#open)", "@scope([open])"],
  ["starting-style", "@starting-style", "@starting-style"],
  ["starting_style", "@starting_style", "@starting-style"],
  ["supports", "@supports (display:grid)", "@supports(display:grid)"],
];

const NOT_APPLIED: readonly [name: string, source: string, css: string][] = [
  ["empty", "@empty", ":nth-child(empty)"],
  ["charset", "@charset", "@charset"],
  ["color-profile", "@color-profile", "@color-profile"],
  ["counter-style", "@counter-style", "@counter-style"],
  ["font-face", "@font-face", "@font-face"],
  ["font-feature-values", "@font-feature-values", "@font-feature-values"],
  ["font-palette-values", "@font-palette-values", "@font-palette-values"],
  ["import", "@import", ":@import"],
  ["keyframes", "@keyframes", "@keyframes"],
  ["namespace", "@namespace", "@namespace"],
  ["page", "@page", "@page"],
  ["property", "@property", "@property"],
  ["view-transition", "@view-transition", "@view-transition"],
  ["hover", "@hover", "@hover"],
  ["focus-visible", "@focus-visible", "@focus-visible"],
  ["first-child", "@first-child", ":first-child-child"],
  ["last-of-type", "@last-of-type", ":last-child-of-type"],
  ["placeholder-shown", "@placeholder-shown", "::placeholder-shown"],
  ["has", "@has(icon)", "@has(icon)"],
  ["not", "@not(@hovered)", "@not(:hover)"],
  ["is", "@is(@first, @last)", "@is(:first-child,:last-child)"],
  ["where", "@where(@checked)", "@where(:checked)"],
  ["nth-child", "@nth-child(2)", "@nth-child(2)"],
  ["dir", "@dir(rtl)", "@dir(rtl)"],
  ["lang", "@lang(en)", "@lang(en)"],
];

describe("known selector states (#2154)", () => {
  it.each(APPLIED)("accepts %s, which the player writes from %s as %s", (name, source, css) => {
    expect(isKnownSelectorState(name)).toBe(true);
    expect(getCSSSelector(source, { sm: 640 })).toBe(css);
  });

  it.each(NOT_APPLIED)("warns on %s, which the player leaves from %s as %s", (name, source, css) => {
    expect(isKnownSelectorState(name)).toBe(false);
    expect(getCSSSelector(source, { sm: 640 })).toBe(css);
  });

  it("covers every accepted name in the table", () => {
    expect(new Set(APPLIED.map(([name]) => name))).toEqual(KNOWN_SELECTOR_STATES);
  });

  it("accepts only the player's own names and theme", () => {
    const aliasNames = new Set(Object.keys(SELECTOR_STATE_ALIASES).map((key) => key.slice(1).replace(/[(]$/, "")));
    for (const name of KNOWN_SELECTOR_STATES) {
      expect(name === "theme" || aliasNames.has(name)).toBe(true);
    }
  });
});
