// A labelled input widget (`slider "Master Volume"`) renders as one <label>
// that carries the widget's name and classes, with the <input> inside it named
// `control`. The page resolves a transition's targets by class name, preferring
// elements whose class name is exactly the target, so the label's class name
// must be the widget's name and nothing more: otherwise a bare `slider` beside
// it takes every `slider` target and the labelled one is skipped.
//
// The lock: `interactable = false` on the widget sets the label's
// pointer-events, and the control inherits it through its builtin style. That
// rule has to outrank the opt-ins that set `pointer-events: auto` on a control,
// such as the tooltip rule, or a locked checkbox with a tooltip toggles on
// click.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

describe("labelled input widgets in the page", () => {
  test("a widget's name finds it labelled or bare alike", async () => {
    const h = createDOMHarness(
      `layout settings with
  column {
    slider "Named volume" #value=50
    slider #value=50
  }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const label = h.overlay.querySelector<HTMLElement>("label");
    expect(label, h.overlay.innerHTML).not.toBeNull();
    expect(label!.className).toBe("slider");
    const bare = [...h.overlay.querySelectorAll<HTMLElement>("input")].find(
      (el) => el.parentElement !== label,
    );
    expect((h.ui as any).findTargetElements("slider")).toEqual([label, bare]);
  });

  test("an enabled control inherits its label's lock over a tooltip's opt-in", async () => {
    const h = createDOMHarness(
      `layout main with
  checkbox "Locked" #interactable=false #tooltip="Help"
end
`,
      0,
      { autoOpenAll: true },
    );
    await h.ready;
    await flushMicrotasks(20);
    const css = [...h.overlay.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    // The tooltip opt-in is `.layouts [data-tooltip]`, two classes' worth.
    // Each control style's label rule hands the lock to an enabled control at
    // three classes' worth (`.checkbox > .control:enabled`), so it wins.
    for (const name of ["checkbox", "radio", "switch", "input", "slider"]) {
      const rule = css.match(
        new RegExp(
          `spark-web-player #game \\.${name} \\{\\n  &:where\\(label\\) \\{[\\s\\S]*?\\n  \\}`,
        ),
      );
      expect(rule, name).not.toBeNull();
      expect(rule![0], name).toMatch(
        />\.control:enabled \{\s*pointer-events: inherit;/,
      );
    }
  });
});
