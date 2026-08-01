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
  foldout "More" #open={shown}:
    text "Body"
  modal #open=false:
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
    table_body:
      table_row:
        cell "Wide" #colspan=2
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

describe("props the validator accepts actually reach the DOM", () => {
  // These validated clean and then did nothing: the runtime's routing list was
  // a separate hand-maintained copy that had drifted from the validator's, so
  // they were sent to `style[prop]` and dropped by CSSOM. No attribute, no
  // style, no warning.
  test("minlength/spellcheck/size land as attributes, not as style", async () => {
    const h = await render(`layout main with
  input #maxlength=10 #minlength=3 #spellcheck="false" #size=20
end
`);
    const input = h.overlay.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("maxlength")).toBe("10");
    expect(input.getAttribute("minlength")).toBe("3");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("size")).toBe("20");
    // Nothing leaked into the inline style.
    expect(input.getAttribute("style") ?? "").toBe("");
  });

  // `spellcheck`/`draggable`/`translate` are ENUMERATED, not boolean: `="false"`
  // is a real value that must survive rather than being removed as "absent".
  test("an enumerated attribute keeps its explicit false", async () => {
    const h = await render(`store off = false
layout main with
  box #draggable={off} #translate={off}
end
`);
    const box = h.overlay.querySelector(".box") as HTMLElement;
    expect(box.getAttribute("draggable")).toBe("false");
    expect(box.getAttribute("translate")).toBe("false");
  });
});

describe("an inline custom property reaches the element", () => {
  // The compiler-side test proves the line parses; this proves the declaration
  // is actually written, which is what the warning promised the author.
  test("`#--my-var` becomes a real custom property", async () => {
    const h = await render(`layout main with
  box #--my-var=4 #gap=12 #background-color=red:
    text "x"
end
`);
    const box = h.overlay.querySelector(".box") as HTMLElement;
    expect(box.style.getPropertyValue("--my-var")).toBe("4");
    // And the attributes after it survived.
    expect(box.style.getPropertyValue("gap")).toBe("12px");
    expect(box.style.getPropertyValue("background-color")).toContain("red");
  });
});
