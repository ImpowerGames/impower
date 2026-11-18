import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

define P as image with
  src = "https://example.com/p.png"
end

framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}

layout main {
  stage {
    backdrop {
      image
    }
    portrait {
      mask.shade
      image
    }
  }
  textbox {
    dialogue {
      text
    }
  }
}



scene start
  [[show backdrop BG at right]]
  [[show portrait P at sofa]]
  Placed.
  [[show backdrop BG at left]]
  Moved left.
  [[show backdrop BG]]
  Back to the default.
  [[show backdrop BG at right]]
  Right again.
  [[hide backdrop]]
  Hidden.
  [[show backdrop]]
  Shown again.
  [[show backdrop BG at left]]
  Left again.
  [[show backdrop]]
  Still left.
  [[show backdrop BG at right]]
  Right once more.
  [[animate backdrop BG with shake]]
  Shaken.
end
`;

const PLACEMENT = new Set([
  "translate",
  "scale",
  "rotate",
  "transform",
  "transform-origin",
  "left",
  "top",
  "right",
  "bottom",
  "inset",
  "width",
  "height",
  "margin",
  "margin-left",
  "margin-top",
  "background-position",
  "background-size",
  "mask-position",
  "mask-size",
]);

const pictures = (overlay: HTMLElement, layer: string) => {
  const layerEl = overlay.querySelector(`.${layer}`);
  return Array.from(layerEl?.querySelectorAll(":scope > .image > .instance, :scope > .mask > .instance") ?? []).map(
    (el) => {
      const style = (el as HTMLElement).style;
      const placed: Record<string, string> = {};
      for (let i = 0; i < style.length; i += 1) {
        const name = style.item(i);
        if (PLACEMENT.has(name)) {
          placed[name] = style.getPropertyValue(name);
        }
      }
      return { kind: (el.parentElement as HTMLElement).classList.contains("mask") ? "mask" : "image", placed };
    },
  );
};

async function played(beats: number) {
  const h = createDOMHarness(SOURCE);
  await h.ready;
  h.jumpTo("start");
  for (let i = 0; i < beats; i += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    await h.display(beat!, true);
    await flushMicrotasks();
  }
  return h;
}

describe("a layer's picture placed at its framing (I-2480)", () => {
  test("show … at places the image and mask elements with translate and scale only", async () => {
    const h = await played(1);
    expect(pictures(h.overlay, "backdrop")).toEqual([
      { kind: "image", placed: { translate: "calc(0.5 * (100cqw - 100%)) 0px" } },
    ]);
    expect(pictures(h.overlay, "portrait")).toEqual([
      {
        kind: "mask",
        placed: { translate: "calc(0.1 * (100cqw - 120%)) calc(0.5 * (100cqh - 120%))", scale: "1.2" },
      },
      {
        kind: "image",
        placed: { translate: "calc(0.1 * (100cqw - 120%)) calc(0.5 * (100cqh - 120%))", scale: "1.2" },
      },
    ]);
  });

  test("a later show … at places the new picture at its own framing", async () => {
    const h = await played(2);
    expect(pictures(h.overlay, "backdrop").at(-1)).toEqual({
      kind: "image",
      placed: { translate: "calc(-0.5 * (100cqw - 100%)) 0px" },
    });
  });

  test("a show without at leaves the picture at the default framing, unplaced", async () => {
    const h = await played(3);
    expect(pictures(h.overlay, "backdrop").at(-1)).toEqual({ kind: "image", placed: {} });
  });

  test("showing a hidden layer again puts the picture it kept back at the default framing", async () => {
    const h = await played(6);
    const shown = pictures(h.overlay, "backdrop");
    expect(shown.length).toBeGreaterThan(0);
    for (const picture of shown) {
      expect(picture).toEqual({ kind: "image", placed: {} });
    }
  });

  test("an animate that names the picture adds its copy at the layer's framing", async () => {
    const h = await played(10);
    const shown = pictures(h.overlay, "backdrop");
    expect(shown.length).toBeGreaterThan(1);
    for (const picture of shown) {
      expect(picture).toEqual({ kind: "image", placed: { translate: "calc(0.5 * (100cqw - 100%)) 0px" } });
    }
  });

  test("showing a layer that was not hidden keeps its picture at its framing", async () => {
    const h = await played(8);
    expect(pictures(h.overlay, "backdrop").at(-1)).toEqual({
      kind: "image",
      placed: { translate: "calc(-0.5 * (100cqw - 100%)) 0px" },
    });
  });
});
