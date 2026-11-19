import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

define P as image with
  src = "https://example.com/p.png"
end

define NARROW as image with
  src = "https://example.com/narrow.png"
end

define WIDE as image with
  src = "https://example.com/wide.png"
end

define STACK as layered_image with
  assets = { NARROW, WIDE }
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
  [[show backdrop STACK at right]]
  Stacked.
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
      return {
        kind: (el.parentElement as HTMLElement).classList.contains("mask") ? "mask" : "image",
        framed: el.classList.contains("framed"),
        placed,
      };
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
      { kind: "image", framed: true, placed: { translate: "calc(100cqw - 100%) calc(50cqh - 50%)" } },
    ]);
    expect(pictures(h.overlay, "portrait")).toEqual([
      {
        kind: "mask",
        framed: true,
        placed: { translate: "calc(60cqw - 62%) calc(100cqh - 110%)", scale: "1.2" },
      },
      {
        kind: "image",
        framed: true,
        placed: { translate: "calc(60cqw - 62%) calc(100cqh - 110%)", scale: "1.2" },
      },
    ]);
  });

  test("a later show … at places the new picture at its own framing", async () => {
    const h = await played(2);
    expect(pictures(h.overlay, "backdrop").at(-1)).toEqual({
      kind: "image",
      framed: true,
      placed: { translate: "0px calc(50cqh - 50%)" },
    });
  });

  test("a show without at leaves the picture at the default framing, unplaced", async () => {
    const h = await played(3);
    expect(pictures(h.overlay, "backdrop").at(-1)).toEqual({ kind: "image", framed: false, placed: {} });
  });

  test("showing a hidden layer again puts the picture it kept back at the default framing", async () => {
    const h = await played(6);
    const shown = pictures(h.overlay, "backdrop");
    expect(shown.length).toBeGreaterThan(0);
    for (const picture of shown) {
      expect(picture).toEqual({ kind: "image", framed: false, placed: {} });
    }
  });

  test("an animate that names the picture adds its copy at the layer's framing", async () => {
    const h = await played(10);
    const shown = pictures(h.overlay, "backdrop");
    expect(shown.length).toBeGreaterThan(1);
    for (const picture of shown) {
      expect(picture).toEqual({ kind: "image", framed: true, placed: { translate: "calc(100cqw - 100%) calc(50cqh - 50%)" } });
    }
  });

  test("a layered picture carries a hidden image for every layer, so its widest layer sizes it", async () => {
    const h = await played(11);
    const layer = h.overlay.querySelector(".backdrop > .image");
    const stack = Array.from(layer?.querySelectorAll(":scope > .instance") ?? []).at(-1);
    expect(Array.from(stack?.querySelectorAll(":scope > img.object") ?? []).map((img) => img.getAttribute("src"))).toEqual([
      "https://example.com/narrow.png",
      "https://example.com/wide.png",
    ]);
    expect(pictures(h.overlay, "backdrop").at(-1)).toEqual({
      kind: "image",
      framed: true,
      placed: { translate: "calc(100cqw - 100%) calc(50cqh - 50%)" },
    });
  });

  test("showing a layer that was not hidden keeps its picture at its framing", async () => {
    const h = await played(8);
    expect(pictures(h.overlay, "backdrop").at(-1)).toEqual({
      kind: "image",
      framed: true,
      placed: { translate: "0px calc(50cqh - 50%)" },
    });
  });
});
