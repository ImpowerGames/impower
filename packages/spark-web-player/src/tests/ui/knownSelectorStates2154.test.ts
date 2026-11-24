import { describe, expect, it } from "vitest";
import { getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import { sparkleSelectorToCssSelector } from "../../../../sparkle-screen-renderer/src/runtime/css";
import {
  isKnownSelectorState,
  KNOWN_SELECTOR_STATES,
  selectorStateArguments,
} from "../../../../sparkdown/src/compiler/constants/selectorStates";

const PLAIN_STANDARD_STATES = [
  "active",
  "any-link",
  "autofill",
  "default",
  "defined",
  "empty",
  "first-child",
  "first-of-type",
  "focus",
  "focus-visible",
  "focus-within",
  "fullscreen",
  "hover",
  "in-range",
  "last-child",
  "last-of-type",
  "link",
  "modal",
  "only-child",
  "only-of-type",
  "open",
  "optional",
  "out-of-range",
  "picture-in-picture",
  "placeholder-shown",
  "popover-open",
  "read-only",
  "read-write",
  "root",
  "target",
  "user-invalid",
  "user-valid",
  "visited",
];

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
  ["latest", "@latest", "[data-latest]"],
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
  ...PLAIN_STANDARD_STATES.map((name): [string, string, string] => [name, `@${name}`, `:${name}`]),
  ["has", "@has(icon)", ":has(.icon)"],
  ["not", "@not(@hovered)", ":not(:hover)"],
  ["is", "@is(@first, @last)", ":is(:first-child,:last-child)"],
  ["where", "@where(@checked)", ":where(:checked)"],
  ["host", "@host(card)", ":host(.card)"],
  ["host-context", "@host-context(card)", ":host-context(.card)"],
  ["nth-child", "@nth-child(2n of card)", ":nth-child(2n of .card)"],
  ["nth-last-child", "@nth-last-child(-n + 3)", ":nth-last-child(-n + 3)"],
  ["nth-of-type", "@nth-of-type(2n + 1)", ":nth-of-type(2n + 1)"],
  ["nth-last-of-type", "@nth-last-of-type(2)", ":nth-last-of-type(2)"],
  ["dir", "@dir(rtl)", ":dir(rtl)"],
  ["lang", "@lang(en)", ":lang(en)"],
  ["state", "@state(open)", ":state(open)"],
];

const NOT_APPLIED: readonly [name: string, source: string, css: string][] = [
  ["charset", "@charset", "@charset"],
  ["color-profile", "@color-profile", "@color-profile"],
  ["counter-style", "@counter-style", "@counter-style"],
  ["font-face", "@font-face", "@font-face"],
  ["font-feature-values", "@font-feature-values", "@font-feature-values"],
  ["font-palette-values", "@font-palette-values", "@font-palette-values"],
  ["import", "@import", "@import"],
  ["keyframes", "@keyframes", "@keyframes"],
  ["namespace", "@namespace", "@namespace"],
  ["page", "@page", "@page"],
  ["property", "@property", "@property"],
  ["view-transition", "@view-transition", "@view-transition"],
  ["left", "@left", "@left"],
  ["right", "@right", "@right"],
  ["paused", "@paused", "@paused"],
  ["playing", "@playing", "@playing"],
  ["hoverd", "@hoverd", "@hoverd"],
];

describe("known selector states (#2154, #2502)", () => {
  it.each(APPLIED)("accepts %s, which the player writes from %s as %s", (name, source, css) => {
    expect(isKnownSelectorState(name)).toBe(true);
    expect(getCSSSelector(source, { sm: 640 })).toBe(css);
  });

  it.each(NOT_APPLIED)("warns on %s, which the player leaves from %s as %s", (name, source, css) => {
    expect(isKnownSelectorState(name)).toBe(false);
    expect(getCSSSelector(source, { sm: 640 })).toBe(css);
  });

  it.each(APPLIED)("gives %s an argument shape its source %s follows", (name, source) => {
    const shape = selectorStateArguments(name);
    const called = source.startsWith(`@${name}(`);
    expect(shape).toBeDefined();
    expect(shape === "required" ? called : shape === "none" ? !called : true).toBe(true);
  });

  it("gives no argument shape to a name it does not know", () => {
    expect(NOT_APPLIED.map(([name]) => selectorStateArguments(name))).toEqual(NOT_APPLIED.map(() => undefined));
  });

  it("covers every accepted name in the table", () => {
    expect(new Set(APPLIED.map(([name]) => name))).toEqual(KNOWN_SELECTOR_STATES);
  });

  it.each(APPLIED.filter(([name]) => name !== "theme"))(
    "writes %s in the screen preview as the player does",
    (_name, source, css) => {
      expect(sparkleSelectorToCssSelector(source, { sm: 640 })).toBe(css);
    },
  );
});
