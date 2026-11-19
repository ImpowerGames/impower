import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const svg = (width: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="100"><rect width="100%" height="100%" fill="#d33"/><rect x="${width - 20}" width="20" height="100" fill="#3a3"/></svg>`;

const inline = (width: number) => `data:image/svg+xml,${encodeURIComponent(svg(width))}`;

const SOURCE = `define WIDE as image with
  src = "https://example.com/wide.svg"
end

define PANORAMA as image with
  src = "https://example.com/panorama.svg"
end

define NARROW_INLINE as image with
  src = "${inline(100)}"
end

define WIDE_INLINE as image with
  src = "${inline(400)}"
end

define STACK as layered_image with
  assets = { NARROW_INLINE, WIDE_INLINE }
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
  [[show backdrop WIDE]]
  Default.
  [[show backdrop WIDE at left]]
  Left.
  [[show backdrop WIDE at right]]
  Right.
  [[show backdrop WIDE at sofa]]
  [[show portrait WIDE at sofa]]
  Sofa.
  [[show backdrop STACK at right]]
  Stacked.
  [[show backdrop PANORAMA at right]]
  Panorama.
  [[show backdrop NARROW_INLINE at right]]
  Narrow.
  [[show backdrop "url(https://example.com/wide.svg)" at right]]
  Literal.
  [[show backdrop "linear-gradient(red, blue)" at right]]
  Gradient.
end
`;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function rendered(beats: number, layer: "backdrop" | "portrait" = "backdrop") {
  const h = createDOMHarness(SOURCE);
  await h.ready;
  h.jumpTo("start");
  for (let i = 0; i < beats; i += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    await h.display(beat!, true);
    await flushMicrotasks();
  }
  const styles = Array.from(h.overlay.querySelectorAll("style"), (el) => el.outerHTML).join("");
  const contents = Array.from(h.overlay.querySelectorAll(`.${layer} > .image, .${layer} > .mask`)).map((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    for (const picture of Array.from(copy.children).slice(0, -1)) {
      picture.remove();
    }
    return copy.outerHTML;
  });
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await page.route("https://example.com/**", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: svg(route.request().url().includes("panorama") ? 2000 : 400) }),
  );
  await page.setContent(
    `<style>body{margin:0}spark-web-player{display:block}#game{position:relative;width:400px;height:200px}</style>${styles}<spark-web-player><div id="game">${contents.join("")}</div></spark-web-player>`,
  );
  await page.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => (img as HTMLImageElement).decode())));
  return page;
}

const measure = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    return Array.from(document.querySelectorAll("#game > *")).map((content) => ({
      layer: box(content),
      picture: box(content.lastElementChild!),
    }));
  });

describe("a layer's picture placed at its framing, as Chromium lays it out (I-2480)", () => {
  test("at the default framing the picture element is its layer's box, so its background can still pan", async () => {
    const page = await rendered(1);
    const { layer, picture } = (await measure(page))[0]!;
    expect(picture).toEqual(layer);
    await page.close();
  });

  test("at left the picture's left edge sits on the layer's left edge, at the size the layer draws it", async () => {
    const page = await rendered(2);
    const { layer, picture } = (await measure(page))[0]!;
    expect(picture.width).toBeCloseTo(800, 1);
    expect(picture.height).toBeCloseTo(200, 1);
    expect(picture.left).toBeCloseTo(layer.left, 1);
    await page.close();
  });

  test("at right the picture's right edge sits on the layer's right edge", async () => {
    const page = await rendered(3);
    const { layer, picture } = (await measure(page))[0]!;
    expect(picture.width).toBeCloseTo(800, 1);
    expect(picture.left + picture.width).toBeCloseTo(layer.left + layer.width, 1);
    await page.close();
  });

  test("an author's framing puts its point on the layer's point at its zoom, and stays there when the game is resized at rest", async () => {
    const page = await rendered(4);
    for (const size of [
      { width: 400, height: 200 },
      { width: 300, height: 260 },
    ]) {
      await page.evaluate(({ width, height }) => {
        const game = document.getElementById("game")!;
        game.style.width = `${width}px`;
        game.style.height = `${height}px`;
      }, size);
      const { layer, picture } = (await measure(page))[0]!;
      expect(picture.height).toBeCloseTo(layer.height * 1.2, 1);
      expect(picture.width).toBeCloseTo(layer.height * 4 * 1.2, 1);
      expect(picture.left + 0.6 * picture.width).toBeCloseTo(layer.left + 0.6 * layer.width, 1);
      expect(picture.top + picture.height).toBeCloseTo(layer.top + layer.height, 1);
    }
    await page.close();
  });

  test("a layer's mask and image elements are placed as one", async () => {
    const page = await rendered(4, "portrait");
    const [mask, image] = await measure(page);
    expect(mask!.picture).toEqual(image!.picture);
    expect(image!.picture.height).toBeCloseTo(image!.layer.height * 1.2, 1);
    expect(image!.picture.left + 0.6 * image!.picture.width).toBeCloseTo(image!.layer.left + 0.6 * image!.layer.width, 1);
    await page.close();
  });

  test("a picture many layers wide stays at its framing when the layer becomes much narrower at rest", async () => {
    const page = await rendered(6);
    for (const size of [
      { width: 400, height: 400 },
      { width: 40, height: 400 },
    ]) {
      await page.evaluate(({ width, height }) => {
        const game = document.getElementById("game")!;
        game.style.width = `${width}px`;
        game.style.height = `${height}px`;
      }, size);
      const { layer, picture } = (await measure(page))[0]!;
      expect(picture.width).toBeCloseTo(layer.height * 20, 1);
      expect(picture.left + picture.width).toBeCloseTo(layer.left + layer.width, 1);
    }
    await page.close();
  });

  test("a picture narrower than its layer sits on the layer's edge at right", async () => {
    const page = await rendered(7);
    const { layer, picture } = (await measure(page))[0]!;
    expect(picture.width).toBeCloseTo(200, 1);
    expect(picture.left + picture.width).toBeCloseTo(layer.left + layer.width, 1);
    await page.close();
  });

  test("a picture written as a url literal is placed at its framing like a named one", async () => {
    const page = await rendered(8);
    const { layer, picture } = (await measure(page))[0]!;
    expect(picture.width).toBeCloseTo(800, 1);
    expect(picture.left + picture.width).toBeCloseTo(layer.left + layer.width, 1);
    await page.close();
  });

  test("a picture with no image, such as a gradient, still fills its layer at a framing", async () => {
    const page = await rendered(9);
    const { layer, picture } = (await measure(page))[0]!;
    expect(picture).toEqual(layer);
    await page.close();
  });

  test("a layered picture is as wide as its widest layer, inline layers included", async () => {
    const page = await rendered(5);
    const { layer, picture } = (await measure(page))[0]!;
    expect(picture.width).toBeCloseTo(800, 1);
    expect(picture.left + picture.width).toBeCloseTo(layer.left + layer.width, 1);
    await page.close();
  });
});
