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
