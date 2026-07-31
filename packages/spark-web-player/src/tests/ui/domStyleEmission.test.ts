// Regressions in the style -> CSS emission path. Each of these produced CSS
// that was silently INERT: the browser dropped the declaration and the visual
// simply never appeared, with nothing failing anywhere.

import { describe, expect, test } from "vitest";
import { CUSTOM_PROPERTY_ALIASES } from "@impower/sparkdown/src/compiler/constants/dataAttributeProps";
import { CSS_UTILITIES } from "../../../../sparkle-style-transformer/src/constants/CSS_UTILITIES";
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

    // The spinner itself is NOT in the button's block any more — it is one
    // global rule (see `busySpinner.test.ts`), because `#busy` is authorable on
    // any element and two per-component copies meant a busy `box` drew nothing.
    // What the button still owns is what differs about wearing one on a filled
    // primary background.
    expect(block).toContain("--spinner-color: white;");
    expect(block).toContain("margin-right: 0.5rem;");

    // The drawing lives in the sheet, just not under this selector.
    expect(out).toContain('content: "";');
    expect(out).toContain("animation-name: spin;");
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
  text "Abbr." #tooltip="Abbreviation"
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

  // `>>` is the descendant operator, and it used to lose its combinator in
  // LEADING position: it lowers to a space, and a leading space was then eaten
  // by the closing trim, so `>> foo` emitted `.foo` — which native nesting
  // reads as `&.foo`, the element ITSELF. It compiled clean and matched
  // something else entirely.
  test("a leading `>>` is a descendant, not a compound", async () => {
    const out = await css(`style probe with
  >> text:
    letter-spacing = 0.123rem
end
layout main with
  box probe:
    text "x"
end
`);
    const rule = out.slice(out.indexOf(".probe {"), out.indexOf(".probe {") + 200);
    // A space before the class is what makes it a descendant.
    expect(rule).toMatch(/&\s+\.text\s*\{/);
    expect(rule).not.toMatch(/&\.text\s*\{/);
  });

  // A non-standard prop is authored bare but written to the DOM prefixed, so
  // BOTH sides have to agree or the rule matches nothing.
  test("`#tooltip` is written and selected as `data-tooltip`", async () => {
    const out = await css(`layout main with
  text "Abbr." #tooltip="Abbreviation"
end
`);
    const block = out.slice(out.indexOf(".layouts"));
    const rule = block.slice(0, block.indexOf("\n}\n") + 3);
    expect(rule).toContain("[data-tooltip]");
    // Never the bare form — that would be a non-conforming HTML attribute.
    expect(rule).not.toMatch(/\[tooltip[\]=]/);
  });

  // A plain `list` shows no marker: games use lists overwhelmingly as stacks —
  // menus, inventories, option rows — and `nav` and `menu` each used to carry
  // their own `list-style: none` to undo the default, which is what showed it
  // was backwards. `ordered_list` is numbered because that is what it is FOR.
  // `#list-mark` overrides either without changing the element, so an `<ol>`
  // can drop its numerals and still be announced as ordered. `bulleted` carries
  // the whole document look — marker AND the indent a marker needs — so asking
  // for it stays one word, and `#list-mark` on top varies only the marker.
  test("`list` is bare, `ordered_list` is numbered, `#list-mark` overrides", async () => {
    const src = `layout main with
  list:
    item "a"
  ordered_list:
    item "b"
  list #list-mark="disc":
    item "c"
  ordered_list #list-mark="none":
    item "d"
  list bulleted:
    item "e"
  list bulleted #list-mark="circle":
    item "f"
end
`;
    const out = await css(src);
    const ruleFor = (sel: string) => {
      const i = out.indexOf(sel + " {");
      return i < 0 ? "" : out.slice(i, i + 160);
    };
    expect(ruleFor(".list")).toContain("list-style: none;");
    expect(ruleFor(".list")).toContain("padding-left: 0px;");
    expect(ruleFor(".ordered_list")).toContain("list-style: decimal;");
    expect(ruleFor(".ordered_list")).toContain("padding-left: 40px;");

    // `bulleted` restores the document look in one token. It must set the
    // LONGHAND: the `list-style` shorthand would beat an inline
    // `list-style-type` for position/image, and it must come AFTER `.list` in
    // the sheet or `.list`'s `list-style: none` would win the cascade at equal
    // specificity and the class would silently do nothing.
    expect(ruleFor(".bulleted")).toContain("list-style-type: disc;");
    expect(ruleFor(".bulleted")).toContain("padding-left: 40px;");
    expect(out.indexOf(".bulleted {")).toBeGreaterThan(out.indexOf(".list {"));

    // An inline `#prop` lands as an INLINE STYLE on the element, not as a rule
    // in the sheet — so it has to be read off the DOM.
    const h = createDOMHarness(src, 0, { autoOpenAll: true });
    await h.ready;
    await flushMicrotasks(20);
    const marks = [...h.overlay.querySelectorAll("ul, ol")].map(
      (el) => (el as HTMLElement).style.listStyleType,
    );
    // Two bare elements, the two overridden ones, then the two `bulleted`
    // ones — the plain class carries no INLINE style (its marker comes from the
    // sheet), while `#list-mark` on top of it does.
    expect(marks).toEqual(["", "", "disc", "none", "", "circle"]);
  });

  // Form controls are PRIMITIVES: whatever lays one out decides its spacing.
  // A baked-in `margin-bottom` reads as correct on a web form and as a bug in a
  // game menu, where a `row` of dropdowns and sliders would carry a rhythm step
  // under each one that nothing asked for and no gap accounts for.
  test("controls carry no margin of their own, and take one when asked", async () => {
    const h = createDOMHarness(
      `layout main with
  row:
    input #placeholder="a"
    dropdown:
      option "x"
    slider #min=0 #max=100
  input #placeholder="b" #margin-bottom=18
end
`,
      0,
      { autoOpenAll: true },
    );
    await h.ready;
    await flushMicrotasks(20);
    const style = (el: Element | null) => el?.getAttribute("style") ?? "";
    const controls = [...h.overlay.querySelectorAll("input, select")];

    // Bare in a row: nothing underneath them.
    for (const c of controls.slice(0, 3)) {
      expect(
        style(c),
        `<${c.tagName.toLowerCase()}> should carry no margin of its own`,
      ).not.toContain("margin-bottom");
    }

    // Asked for: honoured. This could NOT be expressed at all until the widget
    // mounters were fixed — they routed EVERY prop to attributes, so
    // `#margin-bottom=18` emitted a literal `margin-bottom="18"` attribute that
    // the browser ignores. Valid-looking markup, no warning, no effect.
    expect(style(controls[controls.length - 1]!)).toContain("margin-bottom: 18px");

    // ...and real attributes still route to attributes.
    expect(
      h.overlay.querySelector('input[type="range"]')?.getAttribute("max"),
    ).toBe("100");
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
    input
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

  // Two lists have to agree for a custom-property alias to work, and they live
  // in different packages: CUSTOM_PROPERTY_ALIASES only stops the validator
  // warning about the authored name, while CSS_UTILITIES is what actually
  // renames it and lets its STYLE_TRANSFORMER resolve the value.
  //
  // Listing a prop in the first alone is WORSE than not listing it: the prop
  // stops being reported as unrecognized and still emits nothing — the precise
  // silent no-op the named-prop lists exist to prevent. Nothing about the
  // failure is visible in either file on its own, so it is checked here.
  test("every custom-property alias is actually emitted by CSS_UTILITIES", () => {
    for (const [authored, cssProp] of CUSTOM_PROPERTY_ALIASES) {
      const utility = CSS_UTILITIES[authored as keyof typeof CSS_UTILITIES] as
        | Record<string, Record<string, string>>
        | undefined;
      expect(
        utility,
        `\`#${authored}\` suppresses the unrecognized-prop warning but has no CSS_UTILITIES entry, so it emits nothing`,
      ).toBeTruthy();
      expect(
        Object.keys(utility![""] ?? {}),
        `\`#${authored}\` must emit \`${cssProp}\``,
      ).toContain(cssProp);
    }
  });
});
