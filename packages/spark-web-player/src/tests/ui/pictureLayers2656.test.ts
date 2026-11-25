import { describe, expect, test } from "vitest";
import { cssLength, layerPaint, layerPosition, layerRepeat, layerSize, MAX_LAYER_TILES, type LayerStyle } from "../../app/morph/pictureLayers";

const AREA = { x: 0, y: 0, width: 200, height: 100 };
const BOXES = { border: { x: -2, y: -2, width: 204, height: 104 }, padding: AREA, content: { x: 10, y: 5, width: 180, height: 90 } };

const style = (overrides: Partial<LayerStyle>): LayerStyle => ({
  size: "auto",
  position: "0% 0%",
  repeat: "no-repeat",
  origin: "padding-box",
  clip: "border-box",
  blend: "normal",
  ...overrides,
});

describe("where a background layer of a still picture is painted, as CSS paints it (#2656)", () => {
  test("lengths resolve px, percentages and calc(), min(), max() and clamp() against their reference", () => {
    expect(cssLength("20px", 100)).toBe(20);
    expect(cssLength("25%", 200)).toBe(50);
    expect(cssLength("calc(100% - 20px)", 220)).toBe(200);
    expect(cssLength("calc((100% - 10px) / 2)", 110)).toBe(50);
    expect(cssLength("min(50%, 30px)", 100)).toBe(30);
    expect(cssLength("max(50%, 30px)", 100)).toBe(50);
    expect(cssLength("clamp(10px, 50%, 40px)", 100)).toBe(40);
    expect(cssLength("calc(-1 * 10px)", 0)).toBe(-10);
    expect(cssLength("env(safe-area-inset-left)", 100)).toBeUndefined();
  });

  test("sizes follow background-size, keeping the files' shape for an auto dimension", () => {
    expect(layerSize("auto 100%", { width: 800, height: 300 }, { width: 40, height: 30 })).toMatchObject({ width: 400, height: 300 });
    expect(layerSize("cover", { width: 200, height: 200 }, { width: 40, height: 20 })).toMatchObject({ width: 400, height: 200 });
    expect(layerSize("contain", { width: 200, height: 200 }, { width: 40, height: 20 })).toMatchObject({ width: 200, height: 100 });
    expect(layerSize("calc(100% - 20px) auto", { width: 220, height: 100 }, { width: 200, height: 100 })).toMatchObject({ width: 200, height: 100 });
  });

  test("positions read one to four values, offsets from far edges included", () => {
    expect(layerPosition("center")).toEqual({ x: { edge: 50 }, y: { edge: 50 } });
    expect(layerPosition("top center")).toEqual({ x: { edge: 50 }, y: { edge: 0 } });
    const far = layerPaint(style({ position: "right 10px bottom 5px", size: "40px 20px" }), BOXES, { width: 40, height: 20 })!;
    expect(far.tiles).toEqual([{ x: 150, y: 75, width: 40, height: 20 }]);
    const computed = layerPaint(style({ position: "calc(100% - 10px) 50%", size: "40px 20px" }), BOXES, { width: 40, height: 20 })!;
    expect(computed.tiles).toEqual([{ x: 150, y: 40, width: 40, height: 20 }]);
  });

  test("repeat values read as one or two keywords", () => {
    expect(layerRepeat("repeat-x")).toEqual(["repeat", "no-repeat"]);
    expect(layerRepeat("repeat-y")).toEqual(["no-repeat", "repeat"]);
    expect(layerRepeat("space round")).toEqual(["space", "round"]);
    expect(layerRepeat("wobble")).toBeUndefined();
  });

  test("repeat tiles the clip box from the layer's position, in both directions", () => {
    const plan = layerPaint(style({ repeat: "repeat", size: "50px 50px", position: "25px 0px", clip: "padding-box" }), BOXES, { width: 10, height: 10 })!;
    expect(plan.tiles.map((t) => [t.x, t.y])).toEqual([
      [-25, 0], [25, 0], [75, 0], [125, 0], [175, 0],
      [-25, 50], [25, 50], [75, 50], [125, 50], [175, 50],
    ]);
  });

  test("space spreads whole tiles across the positioning area and round scales them to a whole count", () => {
    const spaced = layerPaint(style({ repeat: "space no-repeat", size: "60px 20px", clip: "padding-box" }), BOXES, { width: 60, height: 20 })!;
    expect(spaced.tiles.map((t) => t.x)).toEqual([0, 70, 140]);
    const rounded = layerPaint(style({ repeat: "round no-repeat", size: "60px auto", clip: "padding-box" }), BOXES, { width: 60, height: 30 })!;
    expect(rounded.tiles[0]!.width).toBeCloseTo(200 / 3);
    expect(rounded.tiles[0]!.height).toBeCloseTo(100 / 3);
  });

  test("origin sets the positioning area and clip the painted area", () => {
    const plan = layerPaint(style({ origin: "content-box", clip: "content-box", position: "100% 100%", size: "20px 10px" }), BOXES, { width: 20, height: 10 })!;
    expect(plan.tiles).toEqual([{ x: 170, y: 85, width: 20, height: 10 }]);
    expect(plan.clip).toEqual(BOXES.content);
  });

  test("a repeating layer is painted as a pattern from its first tile, and a layer past the drawing cap lists no tiles", () => {
    const plan = layerPaint(style({ repeat: "repeat", size: "1px 1px", clip: "padding-box" }), BOXES, { width: 1, height: 1 })!;
    expect(plan.pattern).toEqual({ tile: { x: 0, y: 0, width: 1, height: 1 }, stepX: 1, stepY: 1, repeatX: true, repeatY: true });
    expect(200 * 100).toBeGreaterThan(MAX_LAYER_TILES);
    expect(plan.tiles).toEqual([]);
    const spaced = layerPaint(style({ repeat: "space", size: "60px 20px", clip: "padding-box" }), BOXES, { width: 60, height: 20 })!;
    expect(spaced.pattern).toBeUndefined();
    expect(layerPaint(style({ repeat: "repeat-x", size: "60px 20px" }), BOXES, { width: 60, height: 20 })!.pattern).toMatchObject({ repeatX: true, repeatY: false });
  });

  test("the blend mode is carried to the plan", () => {
    expect(layerPaint(style({ blend: "multiply" }), BOXES, { width: 10, height: 10 })!.blend).toBe("multiply");
  });
  test("a spaced layer with more tiles than the drawing cap is painted as a pattern stepping by tile and gap, and no axis builds an unbounded list", () => {
    const plan = layerPaint(style({ repeat: "space", size: "1px 1px", clip: "padding-box" }), BOXES, { width: 1, height: 1 })!;
    expect(plan.tiles).toEqual([]);
    expect(plan.pattern).toMatchObject({ tile: { x: 0, y: 0, width: 1, height: 1 }, stepX: 1, stepY: 1, repeatX: true, repeatY: true });
    const gapped = layerPaint(style({ repeat: "space no-repeat", size: "0.03px 10px", clip: "padding-box" }), BOXES, { width: 3, height: 1000 })!;
    expect(gapped.tiles).toEqual([]);
    expect(gapped.pattern!.stepX).toBeGreaterThan(0.03 - 1e-9);
    expect(gapped.pattern!.repeatY).toBe(false);
    const tiny = layerPaint(style({ repeat: "repeat", size: "0.000001px 0.000001px", clip: "padding-box" }), BOXES, { width: 1, height: 1 })!;
    expect(tiny.tiles).toEqual([]);
    expect(tiny.pattern).toBeDefined();
  });
});
