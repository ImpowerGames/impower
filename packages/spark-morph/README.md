# Spark Morph

Dependency-free geometry for morphing two drawn shapes. It parses SVG path data into cubic subpaths, pairs shapes by label, interpolates a pair with an explicitly chosen method, builds the aperture between two morphing edges, and precomputes numeric frames a player can interpolate every tick without touching a string. It has no DOM, file system, document tree or asset access; callers hand it plain geometry and labels and get back results plus structured failures.

## Pipeline

1. `parsePathData(d)` turns path data into `Subpath[]` of absolute cubics. Lines, quadratics, smooth variants and arcs are all promoted to cubics. `basicShapeToPathData` covers rect, circle, ellipse, line, polyline and polygon, and `serializePathData` writes cubics back out.
2. `pairShapes(from, to)` pairs `LabelledShape`s with an identical nonempty label. One side with a single shape pairs one-to-many; equal counts pair by nearest position (the mean of segment start points) deterministically; unequal counts with neither side single leave every shape of that label unpaired with a diagnostic. Empty labels never pair. Each pair carries a `trackId` that is the same in either direction and distinct for shapes that share a destination.
3. `morphSubpaths(from, to, { method })` interpolates one pair with `ribbon` or `shape`. Compound drawings pair subpaths in document order, only with equal counts. A subpath identical in both drawings stays still. There is no automatic method selection: a method that cannot handle the geometry returns `{ ok: false, failure }` with a code (`tips-not-found`, `self-intersection`, `thickness`, `subpath-count`, `empty-geometry`) so the caller can apply the author's chosen fallback.
4. `morphScale(drawing, "grow" | "shrink")` is the fallback geometry for a drawing with no counterpart: it scales about the mean of segment start points, is invisible at the zero endpoint, and returns the authored drawing exactly at the full endpoint.
5. `buildApertures(edges)` takes ribbon tracks and forms an aperture from each pair whose tips coincide at progress 0. Three or more edges sharing tips are reported as ambiguous rather than guessed; a lone edge is reported as unpaired. Two eyes give two apertures for the bake layer to union within one clip entry.
6. `sampleMorph(morph, count)` precomputes `count` frames as flat `Float64Array`s with one shared layout, plus the authored endpoints as path data. `interpolateSamples(samples, progress)` blends the two nearest frames linearly; progress arrives already shaped by the author's timing and is not eased again. `frameToPathData` writes a frame out for rendering.

## Methods

### ribbon

For thin closed loops with two tapered tips, such as lashes, creases and eyeshadow sweeps. The loop is resampled in a canonical order: one bulged cubic per tip between two flanking anchors, then an equal number of fitted body anchors along each edge, so index k of the source and target correspond. The flanking distance is measured from where each tip's taper ends unless `tipDistance` is given. The target's tip order and winding are chosen by a thickness search: the correspondence whose mid-morph area best holds against the thinner endpoint without self-intersecting. Frames interpolate the body anchors as rigid ribs (centre moves, the half-offset rotates and stretches) so facing anchors orbit rather than cross, and re-aim the tip flanks with a weight that is zero at both rest poses. With `handoff` on (the default) each frame is a polyline blended fully onto the authored art at the rest poses.

Failures: a loop with no two tips folding by at least `tipFoldDegrees` (60) is `tips-not-found`; every correspondence self-intersecting at `checkProgress` is `self-intersection`; a best thickness ratio under `thicknessRatio` (0.62) is `thickness`. The tip finder always ranks two candidates, so `tips-not-found` and the quality gates together are what reject a blob.

### shape

For general closed loops. Both loops are closed if open, resampled evenly by arc length to `samples` points (64), and paired point for point by the rotation with the least summed squared travel over both windings (`correspondence: "uniform"`, the default). Frames are polylines. A correspondence that self-intersects at any `checkProgress` fails with `self-intersection`.

`correspondence: "warp"` is an opt-in refinement: a banded dynamic-time-warping pass realigns the uniform pairing, spreading extra points along one outline where the other has a feature, and tries the three best rotations before giving up. On the synthetic fixtures it makes a star's points emerge from a circle more evenly but adds slight creases when a point emerges from a straight edge unless `warpPenalty` is high, at which point it converges on the uniform result; that is why uniform is the default.

## Tolerances

Numbers below are the tested behaviour on synthetic fixtures about 100 units wide; real art comparisons belong to later tickets.

- Rest-pose frames sit on the authored outline within 0.5 units (ribbon, 48-point handoff polylines) and 0.75 units (shape, 64-point rings).
- No frame self-intersects at the eight bake samples or at 21 evenly spaced runtime progress values.
- The ribbon's mid-morph area holds at or above 0.62 of the thinner endpoint's area.
- A closed aperture's area is at floating-point noise (under 1e-6 square units), not exactly zero.
- Two drawings within 1.2 units per control point (`stillTolerance`) count as identical.
- Eight samples keep the linear blend within 0.23 units of the exact frame on the lash fixture; four samples reach 1.24 and sixteen 0.17. Eight is the initial tuning point, not a guarantee for every drawing.

## Tests

```bash
cd packages/spark-morph && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run --no-file-parallelism
```
