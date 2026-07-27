// Regressions in the style -> CSS emission path. Each of these produced CSS
// that was silently INERT: the browser dropped the declaration and the visual
// simply never appeared, with nothing failing anywhere.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function css(src: string): Promise<string> {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

describe("style emission", () => {
  // A ::before/::after box does not render at all without `content`, and CSS
  // requires the value to be QUOTED. Authors write it bare, and an empty value
  // used to be dropped entirely as "unset" (`content: ;`).
  test("`content` is emitted, and quoted", async () => {
    const out = await css(`style thumbed with
  position = relative
  @before:
    content = ""
    position = absolute
  @after:
    content = "New"
end
layout main with
  box thumbed
end
`);
    const block = out.slice(out.indexOf(".thumbed"));
    expect(block).toContain('content: "";');
    expect(block).toContain('content: "New";');
    // Exactly one declaration — the empty value used to match both the default
    // and the value selector, emitting `content: ""; content: "";`.
    const thumbedOnly = block.slice(0, block.indexOf("\n}") + 2);
    expect(thumbedOnly.match(/content: "";/g)?.length).toBe(1);
  });

  test("`content` keywords and functions stay unquoted", async () => {
    const out = await css(`style k with
  @before:
    content = none
  @after:
    content = attr(data-label)
end
layout main with
  box k
end
`);
    expect(out).toContain("content: none;");
    expect(out).toContain("content: attr(data-label);");
  });

  // A theme color name is not a CSS color — it has to resolve through
  // `var(--theme-color-…)` like every other color prop.
  test("accent-color / caret-color resolve theme colors", async () => {
    const out = await css(`style tinted with
  accent-color = sky_60
  caret-color = amber_60
end
layout main with
  box tinted
end
`);
    expect(out).toContain("accent-color: var(--theme-color-sky_60);");
    expect(out).toContain("caret-color: var(--theme-color-amber_60);");
    expect(out).not.toContain("accent-color: sky_60;");
  });

  // A `<dialog>` is `display: none` until it carries `open`. The base rule has
  // to restate that, or setting `display: flex` for the centred scrim would make
  // a CLOSED modal visible.
  test("dialog is hidden until `open`, then becomes a centred scrim", async () => {
    const out = await css(`store shown = false
layout main with
  modal #open={shown}:
    article:
      text "hi"
end
`);
    const block = out.slice(out.indexOf(".modal {"));
    expect(block).toContain("display: none;");
    expect(block).toContain("position: fixed;");
    expect(block).toContain("&[open]");
    expect(block.slice(block.indexOf("&[open]"))).toContain("display: flex;");
  });

  // `#a=v` cannot be a selector in a style block — that IS the inline prop
  // syntax, so attribute excision ate it and left an EMPTY selector (`  { … }`),
  // silently applying the rule to nothing. `@busy` is the alias.
  test("@busy lowers to an attribute selector with a spinner", async () => {
    const out = await css(`store busy = true
layout main with
  button "Wait" #aria-busy={busy}
end
`);
    const block = out.slice(out.indexOf('&[aria-busy="true"]'));
    expect(out).toContain('&[aria-busy="true"]');
    // The spinner is the ONLY busy affordance: Pico leaves the cursor alone,
    // and swapping in the OS progress cursor reads as "the whole app is
    // blocked" rather than "this one button is working".
    expect(block).not.toContain("cursor: progress;");
    expect(block).toContain("&::before");
    expect(block).toContain('content: "";');
    expect(block).toContain("animation-name: spin;");
    // The referenced keyframes must actually be in the sheet.
    expect(out).toContain("@keyframes spin");
    // Regression: an alias that fails to expand leaves an empty selector.
    expect(out).not.toMatch(/\n\s+\{\n/);
  });

  // A keyframe's `offset` POSITIONS it. It used to do neither job: the
  // selector came from the array index alone, and `offset` fell through into
  // the declarations — emitting a literal `offset: 0.75`, which is a real CSS
  // property (the motion-path shorthand), inside the keyframe.
  test("keyframe `offset` sets the selector and is never a declaration", async () => {
    const out = await css(`animation slide with
  target = layer.self
  keyframes:
    -
      opacity = "0"
    -
      offset = 0.75
      opacity = "1"
    -
      opacity = "0"
  timing:
    duration = 1
    easing = "linear"
    iterations = 1
    fill = "none"
    direction = "normal"
end
layout main with
  text "x"
end
`);
    const block = out.slice(out.indexOf("@keyframes slide"));
    const frames = block.slice(0, block.indexOf("\n}") + 2);
    // Authored offset drives its own frame; the unauthored ends anchor 0/100.
    expect(frames).toContain("0% {");
    expect(frames).toContain("75% {");
    expect(frames).toContain("100% {");
    // `offset` must not survive as a declaration.
    expect(frames).not.toMatch(/\boffset:/);
  });

  // Unauthored keyframes space themselves evenly, as they always did — the
  // offset support must not disturb the common case of no offsets at all.
  test("keyframes with no offsets are still spaced evenly", async () => {
    const out = await css(`animation evenly with
  target = layer.self
  keyframes:
    -
      opacity = "0"
    -
      opacity = "0.5"
    -
      opacity = "1"
  timing:
    duration = 1
    easing = "linear"
    iterations = 1
    fill = "none"
    direction = "normal"
end
layout main with
  text "x"
end
`);
    const block = out.slice(out.indexOf("@keyframes evenly"));
    const frames = block.slice(0, block.indexOf("\n}") + 2);
    expect(frames).toContain("0% {");
    expect(frames).toContain("50% {");
    expect(frames).toContain("100% {");
  });

  // The tooltip is built entirely out of pseudo-elements, so every piece of it
  // has to survive emission: the bubble takes its text from the attribute, the
  // caret is a border triangle, and both are hidden until hover/focus.
  test("tooltip emits a bubble, a caret, and a hover/focus reveal", async () => {
    const out = await css(`layout main with
  text "Abbr." #data-tooltip="Abbreviation"
end
`);
    // Attribute-driven and global: no class is involved, and the rule lives on
    // the `layouts` container so it reaches any element in any layout.
    const block = out.slice(out.indexOf(".layouts"));
    const rule = block.slice(0, block.indexOf("\n}\n") + 3);
    expect(rule).toContain("[data-tooltip]");
    // The bubble's text comes from the attribute, unquoted so it resolves.
    expect(rule).toContain("content: attr(data-tooltip);");
    // Hidden until asked for — both pieces.
    expect(rule).toMatch(/opacity: 0;/);
    // The caret is a border triangle, not a glyph.
    expect(rule).toContain("border-top-color: var(--theme-color-slate_95);");
    expect(rule).toContain("border-left-color: transparent;");
    // Revealed on hover AND on keyboard focus.
    expect(rule).toContain("&:hover::before");
    expect(rule).toContain("&:focus::before");
    // The reveal animations must actually exist in the sheet.
    expect(out).toContain("@keyframes tooltip_slide");
    expect(out).toContain("@keyframes tooltip_caret_slide");
    // A bubble that swallowed the pointer would flicker on/off under it.
    expect(rule).toContain("pointer-events: none;");
  });

  // Pico composes several of its components out of DIRECT-CHILD rules, so the
  // `> selector` form has to survive into the sheet.
  test("`> child` selectors compose article sections and joined groups", async () => {
    const out = await css(`layout main with
  article:
    header "H"
    text "b"
    footer "F"
  row group:
    field
    button "Go"
end
`);
    const article = out.slice(out.indexOf(".article {"));
    // An element's name becomes its CLASS, so `> header` targets `>.header`.
    expect(article).toContain(">.header");
    expect(article).toContain(">.footer");

    const group = out.slice(out.indexOf(".group {"));
    // Joined control: no gap, inner corners squared off.
    expect(group).toContain("gap: 0px;");
    expect(group).toContain(">:first-child");
    expect(group).toContain(">:last-child");
    expect(group.slice(group.indexOf(">:first-child"))).toContain(
      "border-top-right-radius: 0px;",
    );
  });

  // The builtin switch depends on all of the above: a pill track whose thumb is
  // an `@before` box that slides on `@checked`.
  test("the builtin switch has a real thumb that moves when checked", async () => {
    const out = await css(`store on = true
layout main with
  switch #checked={on}
end
`);
    const block = out.slice(out.indexOf(".switch"));
    expect(block).toContain("appearance: none;");
    expect(block).toContain("&::before");
    expect(block).toContain('content: "";');
    expect(block).toContain("&:checked");
    expect(block).toContain("transform: translateX(1rem);");
  });
});
