import { describe, expect, test } from "vitest";
import { fittedRect, pictureFileTraits } from "../../app/morph/pictureFileTraits";

const svg = (attributes: string) => new TextEncoder().encode(`<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"${attributes}><rect width="10" height="10"/></svg>`);

describe("an SVG layer file is fitted into a stretched picture as CSS fits it (#2631, #2632)", () => {
  test("its preserveAspectRatio is read from its root, xMidYMid meet when it has none", async () => {
    expect(await pictureFileTraits(svg(""))).toEqual({ animated: false, profile: false, aspect: "xMidYMid meet" });
    expect(await pictureFileTraits(svg(' preserveAspectRatio="none"'))).toMatchObject({ aspect: "none" });
    expect(await pictureFileTraits(svg(" preserveAspectRatio='xMinYMax slice'"))).toMatchObject({ aspect: "xMinYMax slice" });
  });

  test("meet centres the whole file, slice covers the picture, an alignment places it, and none stretches it", () => {
    expect(fittedRect("xMidYMid meet", 200, 150, 100, 100)).toEqual({ x: 25, y: 0, width: 150, height: 150 });
    expect(fittedRect("xMinYMid meet", 200, 150, 100, 100)).toEqual({ x: 0, y: 0, width: 150, height: 150 });
    expect(fittedRect("xMaxYMid meet", 200, 150, 100, 100)).toEqual({ x: 50, y: 0, width: 150, height: 150 });
    expect(fittedRect("xMidYMid slice", 200, 150, 100, 100)).toEqual({ x: 0, y: -25, width: 200, height: 200 });
    expect(fittedRect("none", 200, 150, 100, 100)).toEqual({ x: 0, y: 0, width: 200, height: 150 });
    expect(fittedRect("xMidYMid meet", 200, 200, 100, 100)).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });
});
