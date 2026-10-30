import { describe, expect, test } from "vitest";
import { CUSTOM_PROPERTY_ALIASES } from "@impower/sparkdown/src/compiler/constants/dataAttributeProps";
import { CSS_UTILITIES } from "../../../../sparkle-style-transformer/src/constants/CSS_UTILITIES";
import { STYLE_TRANSFORMERS } from "../../../../sparkle-style-transformer/src/constants/STYLE_TRANSFORMERS";
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
  test("`content` is emitted, and quoted", async () => {
    const out = await css(`style thumbed with
  position = relative
  @before {
    content = ""
    position = absolute
  }
  @after {
    content = "New"
  }
end
layout main with
  box.thumbed
end
`);
    const block = out.slice(out.indexOf(".thumbed"));
    expect(block).toContain('content: "";');
    expect(block).toContain('content: "New";');
    const thumbedOnly = block.slice(0, block.indexOf("\n}") + 2);
    expect(thumbedOnly.match(/content: "";/g)?.length).toBe(1);
  });

  test("`content` keywords and functions stay unquoted", async () => {
    const out = await css(`style k with
  @before {
    content = none
  }
  @after {
    content = attr(data-label)
  }
end
layout main with
  box.k
end
`);
    expect(out).toContain("content: none;");
    expect(out).toContain("content: attr(data-label);");
  });

  test("accent-color / caret-color resolve theme colors", async () => {
    const out = await css(`style tinted with
  accent-color = sky_60
  caret-color = amber_60
end
layout main with
  box.tinted
end
`);
    expect(out).toContain("accent-color: var(--theme-color-sky_60);");
    expect(out).toContain("caret-color: var(--theme-color-amber_60);");
    expect(out).not.toContain("accent-color: sky_60;");
  });

  test("dialog is hidden until `open`, then becomes a centred scrim", async () => {
    const out = await css(`store shown = false
layout main with
  modal #open={shown} {
    article {
      text "hi"
    }
  }
end
`);
    const block = out.slice(out.indexOf(".modal {"));
    expect(block).toContain("display: none;");
    expect(block).toContain("position: fixed;");
    expect(block).toContain("&[open]");
    expect(block.slice(block.indexOf("&[open]"))).toContain("display: flex;");
  });

  test("@busy lowers to an attribute selector with a spinner", async () => {
    const out = await css(`store busy = true
layout main with
  button "Wait" #aria-busy={busy}
end
`);
    const block = out.slice(out.indexOf('&[aria-busy="true"]'));
    expect(out).toContain('&[aria-busy="true"]');
    expect(block).not.toContain("cursor: progress;");
    expect(block).toContain("&::before");

    expect(block).toContain("--spinner-color: white;");
    expect(block).toContain("margin-right: 0.5rem;");

    expect(out).toContain('content: "";');
    expect(out).toContain("animation-name: spin;");
    expect(out).toContain("@keyframes spin");
    expect(out).not.toMatch(/\n\s+\{\n/);
  });

  test("keyframe `offset` sets the selector and is never a declaration", async () => {
    const out = await css(`animation slide with
  target = layer.self
  keyframes {
    {
      opacity = "0"
    }
    {
      offset = 0.75
      opacity = "1"
    }
    {
      opacity = "0"
    }
  }
  timing {
    duration = 1
    easing = "linear"
    iterations = 1
    fill = "none"
    direction = "normal"
  }
end
layout main with
  text "x"
end
`);
    const block = out.slice(out.indexOf("@keyframes slide"));
    const frames = block.slice(0, block.indexOf("\n}") + 2);
    expect(frames).toContain("0% {");
    expect(frames).toContain("75% {");
    expect(frames).toContain("100% {");
    expect(frames).not.toMatch(/\boffset:/);
  });

  test("keyframes with no offsets are still spaced evenly", async () => {
    const out = await css(`animation evenly with
  target = layer.self
  keyframes {
    {
      opacity = "0"
    }
    {
      opacity = "0.5"
    }
    {
      opacity = "1"
    }
  }
  timing {
    duration = 1
    easing = "linear"
    iterations = 1
    fill = "none"
    direction = "normal"
  }
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

  test("tooltip emits a bubble, a caret, and a hover/focus reveal", async () => {
    const out = await css(`layout main with
  text "Abbr." #tooltip="Abbreviation"
end
`);
    const block = out.slice(out.indexOf(".layouts"));
    const rule = block.slice(0, block.indexOf("\n}\n") + 3);
    expect(rule).toContain("[data-tooltip]");
    expect(rule).toContain("content: attr(data-tooltip);");
    expect(rule).toMatch(/opacity: 0;/);
    expect(rule).toContain("border-top-color: var(--theme-color-slate_95);");
    expect(rule).toContain("border-left-color: transparent;");
    expect(rule).toContain("&:hover::before");
    expect(rule).toContain("&:focus::before");
    expect(out).toContain("@keyframes tooltip_slide");
    expect(out).toContain("@keyframes tooltip_caret_slide");
    expect(rule).toContain("pointer-events: none;");
  });

  test("a leading `>>` is a descendant, not a compound", async () => {
    const out = await css(`style probe with
  >> text {
    letter-spacing = 0.123rem
  }
end
layout main with
  box.probe {
    text "x"
  }
end
`);
    const rule = out.slice(out.indexOf(".probe {"), out.indexOf(".probe {") + 200);
    expect(rule).toMatch(/&\s+\.text\s*\{/);
    expect(rule).not.toMatch(/&\.text\s*\{/);
  });

  test("`#tooltip` is written and selected as `data-tooltip`", async () => {
    const out = await css(`layout main with
  text "Abbr." #tooltip="Abbreviation"
end
`);
    const block = out.slice(out.indexOf(".layouts"));
    const rule = block.slice(0, block.indexOf("\n}\n") + 3);
    expect(rule).toContain("[data-tooltip]");
    expect(rule).not.toMatch(/\[tooltip[\]=]/);
  });

  test("`list` is bare, `ordered_list` is numbered, `#list-mark` overrides", async () => {
    const src = `layout main with
  list {
    item "a"
  }
  ordered_list {
    item "b"
  }
  list #list-mark="disc" {
    item "c"
  }
  ordered_list #list-mark="none" {
    item "d"
  }
  list.bulleted {
    item "e"
  }
  list.bulleted #list-mark="circle" {
    item "f"
  }
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

    expect(ruleFor(".bulleted")).toContain("list-style-type: disc;");
    expect(ruleFor(".bulleted")).toContain("padding-left: 40px;");
    expect(out.indexOf(".bulleted {")).toBeGreaterThan(out.indexOf(".list {"));

    const h = createDOMHarness(src, 0, { autoOpenAll: true });
    await h.ready;
    await flushMicrotasks(20);
    const marks = [...h.overlay.querySelectorAll("ul, ol")].map(
      (el) => (el as HTMLElement).style.listStyleType,
    );
    expect(marks).toEqual(["", "", "disc", "none", "", "circle"]);
  });

  test("controls carry no margin of their own, and take one when asked", async () => {
    const h = createDOMHarness(
      `layout main with
  row {
    input #placeholder="a"
    dropdown {
      option "x"
    }
    slider #min=0 #max=100
  }
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

    for (const c of controls.slice(0, 3)) {
      expect(
        style(c),
        `<${c.tagName.toLowerCase()}> should carry no margin of its own`,
      ).not.toContain("margin-bottom");
    }

    expect(style(controls[controls.length - 1]!)).toContain("margin-bottom: 18px");

    expect(
      h.overlay.querySelector('input[type="range"]')?.getAttribute("max"),
    ).toBe("100");
  });

  test("`> child` selectors compose article sections and joined groups", async () => {
    const out = await css(`layout main with
  article {
    header "H"
    text "b"
    footer "F"
  }
  row.group {
    input
    button "Go"
  }
end
`);
    const article = out.slice(out.indexOf(".article {"));
    expect(article).toContain(">.header");
    expect(article).toContain(">.footer");

    const group = out.slice(out.indexOf(".group {"));
    expect(group).toContain("gap: 0px;");
    expect(group).toContain(">:first-child");
    expect(group).toContain(">:last-child");
    expect(group.slice(group.indexOf(">:first-child"))).toContain(
      "border-top-right-radius: 0px;",
    );
  });

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

  test("a colour prop takes a CSS function instead of mangling it into a token", async () => {
    const out = await css(`style linky with
  text-decoration-color = color-mix(in srgb, currentColor 50%, transparent)
  border-color = oklch(70% 0.1 200)
  background-color = slate_30
end
layout main with
  box.linky
end
`);
    const block = out.slice(out.indexOf(".linky"));
    expect(block).toContain(
      "text-decoration-color: color-mix(in srgb, currentColor 50%, transparent);",
    );
    expect(block).toContain("border-color: oklch(70% 0.1 200);");
    expect(out).not.toContain("var(--theme-color-color-mix");
    expect(out).not.toContain("var(--theme-color-oklch");
    expect(block).toContain("background-color: var(--theme-color-slate_30);");
  });

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

  test("clip-path, fill, stroke and stroke-width emit the authored value", async () => {
    const out = await css(`style shaped with
  clip-path = circle(50%)
  fill = sky_60
  stroke = #ff0000
  stroke-width = 2
end
layout main with
  box.shaped
end
`);
    const block = out.slice(out.indexOf(".shaped"));
    expect(block).toContain("clip-path: circle(50%);");
    expect(block).toContain("fill: var(--theme-color-sky_60);");
    expect(block).toContain("stroke: #ff0000;");
    expect(block).toContain("stroke-width: 2px;");
  });

  test("numbers inside a CSS function in a size prop keep their unit", async () => {
    const out = await css(`style shaped with
  stroke-width = calc(1px * 2 * 3)
  margin = calc(1px * 2) 4
end
layout main with
  box.shaped
end
`);
    const block = out.slice(out.indexOf(".shaped"));
    expect(block).toContain("stroke-width: calc(1px * 2 * 3);");
    expect(block).toContain("margin: calc(1px * 2) 4px;");
  });

  test("every empty-value utility has a STYLE_TRANSFORMER", () => {
    const missing: string[] = [];
    for (const [name, selectors] of Object.entries(
      CSS_UTILITIES as Record<string, Record<string, Record<string, string>>>,
    )) {
      const hasPlaceholder = Object.values(selectors).some((declarations) =>
        Object.values(declarations).some((v) => v === ""),
      );
      if (hasPlaceholder && !(name in STYLE_TRANSFORMERS)) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });
});
