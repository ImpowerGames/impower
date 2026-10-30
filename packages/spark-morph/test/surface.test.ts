import { describe, expect, test } from "vitest";
import * as index from "../src/index";

describe("package surface", () => {
  test("exports the pipeline entry points, the method builders and their defaults", () => {
    expect(Object.keys(index).sort()).toEqual(
      [
        "MORPH_DEFAULTS",
        "MATCH_DEFAULTS",
        "TRACE_DEFAULTS",
        "SEGMENT_STRIDE",
        "BEND_DEFAULTS",
        "basicShapeToPathData",
        "basicShapeToSubpaths",
        "buildApertures",
        "frameToPathData",
        "interpolateSamples",
        "morphScale",
        "morphSubpaths",
        "matchTrack",
        "traceTrack",
        "pairShapes",
        "parsePathData",
        "sampleMorph",
        "scaleTrack",
        "serializePathData",
        "serializeSegments",
        "shapePosition",
        "bendTrack",
        "trackIdFor",
        "unpackFrame",
      ].sort(),
    );
  });

  test("keeps geometry internals off the root", () => {
    const internals = ["ArcLoop", "arcToCubics", "findTips", "smoothAnchors", "signedArea", "lerpLoops", "sameLoop", "snapClosed", "selfIntersects", "splitCubic"];
    for (const name of internals) expect(name in index, name).toBe(false);
  });
});
