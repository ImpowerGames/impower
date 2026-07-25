// Phase 3c: HTML attributes on otherwise-generic elements.
//
// `#prop` normally lowers to an inline STYLE (spec §4.2), which is right for
// `#padding` / `#child-gap`. But `#href` on a link, `#open` on a dialog and
// `#colspan` on a cell have no meaning as CSS — those are routed to attributes
// instead, so the semantic elements added in Phase 3a are actually usable.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

describe("dom attribute props", () => {
  test("href/target on a link become attributes, not styles", async () => {
    const h = await render(`layout main with
  link "Docs" #href="/docs" #target="_blank"
end
`);
    const a = h.overlay.querySelector("a") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/docs");
    expect(a.getAttribute("target")).toBe("_blank");
    // Must NOT have leaked into the inline style.
    expect(a.getAttribute("style") ?? "").not.toContain("href");
  });

  // Regression: the `:` in `://` used to read as a block-opening colon (the
  // header test accepted a bare `//` as a trailing comment), so the value came
  // back as the fragment `"https`. See sparkleValueComments.test.ts.
  test("absolute and protocol-relative URLs survive in a prop value", async () => {
    const h = await render(`layout main with
  link "Docs" #href="https://example.com/a/b?x=1"
  image #src="//cdn.example.com/x.png"
end
`);
    expect(h.overlay.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/a/b?x=1",
    );
    expect(h.overlay.querySelector(".image")?.getAttribute("src")).toBe(
      "//cdn.example.com/x.png",
    );
  });

  test("boolean attributes are presence-based", async () => {
    const h = await render(`store shown = true
layout main with
  details #open={shown}:
    summary "More"
    text "Body"
  dialog #open=false:
    text "Modal"
end
`);
    const details = h.overlay.querySelector("details") as HTMLDetailsElement;
    expect(details.hasAttribute("open")).toBe(true);
    const dialog = h.overlay.querySelector("dialog") as HTMLElement;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  test("colspan/scope on table cells become attributes", async () => {
    const h = await render(`layout main with
  table:
    tbody:
      tr:
        td "Wide" #colspan=2
end
`);
    const td = h.overlay.querySelector("td") as HTMLTableCellElement;
    expect(td.getAttribute("colspan")).toBe("2");
  });

  test("role and aria-*/data-* pass through", async () => {
    const h = await render(`store busy = true
layout main with
  button "Save" #aria-busy={busy}
  box #role="status" #data-testid="live"
end
`);
    const btn = h.overlay.querySelector("button") as HTMLElement;
    expect(btn.getAttribute("aria-busy")).toBe("true");
    const box = h.overlay.querySelector('[role="status"]') as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.getAttribute("data-testid")).toBe("live");
  });

  test("styling props still go to style, not attributes", async () => {
    const h = await render(`layout main with
  box #padding=16 #background-color="slate_30"
end
`);
    const box = h.overlay.querySelector(".box") as HTMLElement;
    expect(box.getAttribute("style") ?? "").toContain("padding");
    expect(box.hasAttribute("padding")).toBe(false);
  });

  test("progress renders as a native <progress> with value/max", async () => {
    const h = await render(`store done = 40
layout main with
  progress #value={done} #max=100
end
`);
    const p = h.overlay.querySelector("progress") as HTMLProgressElement;
    expect(p).toBeTruthy();
    expect(p.getAttribute("max")).toBe("100");
    expect(p.value).toBe(40);
  });
});
