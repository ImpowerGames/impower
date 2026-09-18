import { describe, expect, test } from "vitest";
import * as index from "../src/index";

// The package root is the contract the bake and player build against; the
// geometry helpers behind it are free to change. Pin both directions.

describe("package surface", () => {
  test("exports the pipeline entry points, the method builders and their defaults", () => {
    expect(Object.keys(index).sort()).toEqual(
      [
        "MORPH_DEFAULTS",
        "NODES_DEFAULTS",
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
        "nodesTrack",
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
    const internals = ["ArcLoop", "arcToCubics", "findTips", "smoothAnchors", "taperDistance", "signedArea", "lerpLoops", "sameLoop", "snapClosed", "selfIntersects", "splitCubic"];
    for (const name of internals) expect(name in index, name).toBe(false);
  });
});
