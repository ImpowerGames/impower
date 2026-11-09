import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

function topLevelDeclaration(
  css: string,
  cls: string,
  property: string,
): string | undefined {
  const head = `spark-web-player #game .${cls} {\n`;
  const start = css.indexOf(head);
  if (start < 0) {
    return undefined;
  }
  const end = css.indexOf("\n}", start);
  const body = css.slice(start + head.length, end).split("\n");
  const line = body.find((l) => /^ {2}\S/.test(l) && l.trim().startsWith(`${property}:`));
  return line?.trim().slice(property.length + 1).replace(/;$/, "").trim();
}

let stylesheet = "";

function zIndexOf(el: Element): number | null {
  for (const cls of el.classList) {
    const z = topLevelDeclaration(stylesheet, cls, "z-index");
    if (z !== undefined && z !== "auto") {
      return Number(z);
    }
  }
  return null;
}

function stackingPath(el: Element, root: Element): { z: number; at: Element }[] {
  const path: { z: number; at: Element }[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    const z = zIndexOf(node);
    const layoutRoot =
      node.parentElement === root && !node.classList.contains("main");
    if (z !== null || layoutRoot) {
      path.unshift({ z: z ?? 0, at: node });
    }
    node = node.parentElement;
  }
  return path;
}

function paintsAbove(a: Element, b: Element, root: Element): boolean {
  const pa = stackingPath(a, root);
  const pb = stackingPath(b, root);
  const za = pa[0]?.z ?? 0;
  const zb = pb[0]?.z ?? 0;
  if (za !== zb) {
    return za > zb;
  }
  if (pa[0] && pb[0] && pa[0].at !== pb[0].at) {
    return Boolean(
      pb[0].at.compareDocumentPosition(pa[0].at) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }
  return Boolean(
    b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("the stacking of the built-in layouts, each layout root a stacking context as its opening animation makes it", () => {
  test("the main layout's screen paints above the textbox layout, and a later overlay above the screen", async () => {
    const h = createDOMHarness(
      `layout hud {
  stats {
    text "HP"
  }
}

scene start
  Hello there.
end
`,
      1,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    await h.preview(1);
    await flushMicrotasks(20);
    await h.game.module.ui.applyLayoutInstructions(
      [{ control: "open", name: "hud" }],
      true,
    );
    await flushMicrotasks(20);

    stylesheet = [...h.overlay.querySelectorAll("style")]
      .map((style) => style.textContent ?? "")
      .join("\n");
    const layouts = h.overlay.querySelector(".layouts")!;
    const screen = h.overlay.querySelector(".main > .screen")!;
    const stage = h.overlay.querySelector(".main > .stage")!;
    const textboxRoot = h.overlay.querySelector(".layouts > .layout_textbox")!;
    const dialogueBox = textboxRoot.querySelector(":scope > .textbox")!;
    const choices = textboxRoot.querySelector(":scope > .choices")!;
    const hud = h.overlay.querySelector(".layouts > .hud")!;
    for (const el of [screen, stage, textboxRoot, dialogueBox, choices, hud]) {
      expect(el, h.overlay.innerHTML).toBeTruthy();
    }
    expect(paintsAbove(screen, dialogueBox, layouts)).toBe(true);
    expect(paintsAbove(screen, choices, layouts)).toBe(true);
    expect(paintsAbove(dialogueBox, stage, layouts)).toBe(true);
    expect(paintsAbove(choices, stage, layouts)).toBe(true);
    expect(paintsAbove(hud, screen, layouts)).toBe(true);
    expect(topLevelDeclaration(stylesheet, "layouts", "isolation")).toBe(
      "isolate",
    );
  });
});
