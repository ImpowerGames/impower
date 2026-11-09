import { describe, expect, test } from "vitest";
import {
  createDOMHarness,
  flushMicrotasks,
  type DOMHarness,
} from "./domTestHarness";

function rootsOf(h: DOMHarness): Element[] {
  const layouts = h.overlay.querySelector(".layouts");
  expect(layouts, h.overlay.innerHTML).not.toBeNull();
  return [...layouts!.children];
}

async function opened(source: string, name: string): Promise<DOMHarness> {
  const h = createDOMHarness(source, 0, {
    reactive: true,
    autoOpenAll: false,
  });
  await h.ready;
  await h.game.module.ui.applyLayoutInstructions(
    [{ control: "open", name }],
    true,
  );
  await flushMicrotasks(10);
  return h;
}

const HUD = `layout hud {
  hud {
    text "HP"
  }
}
`;

describe("a layout and an element with the same name", () => {
  test("the built-in textbox layout is kept apart from its textbox element", async () => {
    const h = createDOMHarness(`scene start\n  Hello there.\nend\n`, 1, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    await h.preview(1);
    await flushMicrotasks(20);

    const roots = rootsOf(h);
    expect(roots.map((el) => el.className)).toEqual([
      "main",
      "layout-textbox",
    ]);
    const named = [...h.overlay.querySelectorAll<HTMLElement>(".textbox")];
    expect(named).toHaveLength(1);
    expect(named[0]!.parentElement).toBe(roots[1]);
    expect(h.game.module.ui.findIds("textbox")).toEqual([named[0]!.id]);
    expect(named[0]!.querySelector(".action")?.textContent).toContain(
      "Hello there.",
    );
  });

  test("an author's self-named layout opens and closes by its name", async () => {
    const h = await opened(HUD, "hud");
    expect(h.overlay.querySelector(".layout-hud"), h.overlay.innerHTML).not.toBeNull();
    await h.game.module.ui.applyLayoutInstructions(
      [{ control: "close", name: "hud" }],
      true,
    );
    await flushMicrotasks(10);
    expect(h.overlay.querySelector(".layout-hud")).toBeNull();
    expect(h.overlay.querySelector(".hud")).toBeNull();
  });

  test("an author's self-named layout gives its name to the element, not the root", async () => {
    const h = await opened(HUD, "hud");
    const root = h.overlay.querySelector<HTMLElement>(".layout-hud");
    expect(root, h.overlay.innerHTML).not.toBeNull();
    expect(root!.matches(".hud")).toBe(false);
    const element = root!.querySelector<HTMLElement>(":scope > .hud");
    expect(element, h.overlay.innerHTML).not.toBeNull();
    expect(h.game.module.ui.findIds("hud")).toEqual([element!.id]);
  });

  test("a layout with no self-named element keeps its name on its root", async () => {
    const h = await opened(
      `layout panel {
  box {
    text "Rope"
  }
}
`,
      "panel",
    );
    const root = h.overlay.querySelector<HTMLElement>(".layouts > .panel");
    expect(root, h.overlay.innerHTML).not.toBeNull();
    expect(h.overlay.querySelector(".layout-panel")).toBeNull();
    expect(h.game.module.ui.findIds("panel")).toEqual([root!.id]);
  });
});
