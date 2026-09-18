# Spark Morph

Dependency-free geometry for morphing two drawn shapes. It parses SVG path data into cubic subpaths, pairs shapes by label, interpolates a pair with an explicitly chosen method, builds the aperture between two morphing edges, and precomputes numeric frames a player can interpolate every tick without touching a string. It has no DOM, file system, document tree or asset access; callers hand it plain geometry and labels and get back results plus structured failures.

## Pipeline

1. `parsePathData(d)` turns path data into `Subpath[]` of absolute cubics. Lines, quadratics, smooth variants and arcs (including compact flag syntax such as `A10 10 0 0110 10`) are all promoted to cubics; an arc whose endpoints coincide is omitted as the SVG rule says. `basicShapeToPathData` covers rect, circle, ellipse, line, polyline and polygon, and `serializePathData` writes cubics back out, exactly unless a precision is given.
2. `pairShapes(from, to)` pairs `LabelledShape`s with an identical nonempty label. One side with a single shape pairs one-to-many; equal counts pair by nearest position (the mean of segment start points) deterministically; unequal counts with neither side single leave every shape of that label unpaired with a diagnostic. Empty labels never pair. Each pair carries a `trackId` that is the same in either direction and distinct for shapes that share a destination.
3. `morphSubpaths(from, to, { method })` interpolates one pair with `match`, `bend` or `trace`. Compound drawings pair subpaths in document order, only with equal counts. Every subpath must be closed, by `Z` or by ending within `seamTolerance` of its start; an open one is `not-closed`. A subpath identical in both drawings stays still. There is no automatic method selection: a method that cannot handle the geometry returns `{ ok: false, failure }` with a code (`node-count`, `tips-not-found`, `self-intersection`, `thickness`, `not-closed`, `subpath-count`, `empty-geometry`) so the caller can apply the author's chosen fallback. The low-level builders `matchTrack`, `bendTrack` and `traceTrack` return the same structured failures, including on empty input.
4. `morphScale(drawing, "grow" | "shrink")` is the fallback geometry for a drawing with no counterpart: it scales about the mean of segment start points, is invisible at the zero endpoint, and returns the authored drawing exactly at the full endpoint.
5. `buildApertures(edges)` takes bend tracks and forms an aperture from each pair whose tips coincide at progress 0. Which side of each edge faces the other is decided at the progress where the edges are farthest apart, so a blink authored closed-to-open gives the same aperture as open-to-closed; the opening direction follows the edges as they move, so a rigid rotation is not mistaken for closure. Three or more edges sharing tips are reported as ambiguous rather than guessed; a lone edge is reported as unpaired. Two eyes give two apertures for the bake layer to union within one clip entry.
6. `sampleMorph(morph, count)` precomputes `count` frames as flat `Float64Array`s with one shared layout, plus the authored endpoints as exact path data. `interpolateSamples(samples, progress)` blends the two nearest frames linearly; progress arrives already shaped by the author's timing and is not eased again. `frameToPathData` writes a frame out for rendering.

## Methods

Each method is named by what it pairs on, which is what an author needs to know about their art.

### match

Pairs node with node by index. The second pose is drawn by editing a copy of the first, so both have the same nodes in the same order, and the artist controls the look of the motion by where they place nodes and handles, as in the enve and Friction path animators and design-tool blend tools. Anchors and handles interpolate directly (handle directions rotate the short way while lengths blend, and both handles of a node resolve an exact half-turn the same way, so a smooth node never kinks); a straight edge stays straight and a corner stays a corner. Coincident anchors are dropped and a seam within `seamTolerance` (2% of the perimeter) is snapped shut before pairing, so neither becomes an extra node. A target exported with the opposite winding or a different start node is reversed and rotated to the pairing with the least travel. A different node count is `node-count`. Self-intersection is checked only when `checkProgress` is given: the artist authored the pairing.

### bend

For thin closed loops with two tapered tips, such as lashes, creases and eyeshadow sweeps. The loop is resampled in a canonical order: one bulged cubic per tip between two flanking anchors, then an equal number of fitted body anchors along each edge, so index k of the source and target correspond. The flanking distance is measured from where each tip's taper ends, capped at 12% of the tip-to-tip span (the prototype's hand-tuned 16 pixels on a lash about 130 wide), unless `tipDistance` is given. The target's tip order and winding are chosen by a thickness search: among the correspondences that reconstruct the target, do not self-intersect and hold the mid-morph area, the one whose anchors travel least. Frames interpolate the body anchors as rigid ribs (centre moves, the half-offset rotates and stretches) so facing anchors orbit rather than cross, and re-aim the tip flanks with a weight that is zero at both rest poses. With `handoff` on (the default) each frame is a polyline blended fully onto the authored art at the rest poses, aligned by tip one.

Before resampling, coincident anchors are dropped, the seam is snapped, and nearly smooth nodes (handles within 25 degrees of collinear) are made exactly smooth; a node whose handles meet at a real angle, such as where a rounded tip's arc joins the body edge, is left as drawn. Rounded tips therefore keep their roundness through the morph. A tip curve whose handles reach past each other would tie a hairline knot, so tip handles are shortened until the curve is simple, in the canonical loops and in every frame. The track's `from` and `to` share the frames' topology (polylines with the handoff on); the six-anchor canonical loops are `canonicalFrom` and `canonicalTo`.

Failures: a loop whose two best tip candidates do not both fold the outline back by `tipFoldDegrees` (90) over a twentieth of the perimeter, or whose canonical reconstruction misses the authored area by more than `reconstructionTolerance` (50%), is `tips-not-found`; every correspondence self-intersecting at `checkProgress` is `self-intersection`; a best thickness ratio under `thicknessRatio` (0.62) is `thickness`.

### trace

For any closed shape. Both drawings keep their own anchors and handles. With equal anchor counts they pair anchor with anchor, so a square to a tilted quadrilateral keeps four corners; with different counts, every anchor of the drawing with more anchors pairs with an anchor of the other in cyclic order where the total travel is least, and the leftover anchors become dissolved nodes on the other drawing at the same relative position along its edge, an exact sub-cubic split that leaves the shape unchanged. Straight edges stay straight and corners stay sharp throughout; a corner the target lacks flattens into an edge. Every anchor-to-anchor alignment over both windings is a candidate, ranked by a cheap travel estimate; the best `alignments` (8) are built exactly, checked for self-intersection at `checkProgress`, and the least anchor travel wins.

## Tolerances

Every default that is a distance is a fraction of the drawing's own size, so the same art at a hundredth or a hundred times the scale gives the same outcome (a test pins this at 0.01x, 1x and 100x). The numbers below are the tested behaviour on synthetic fixtures about 100 units wide; real art comparisons belong to later tickets.

- Still detection: two drawings within `stillTolerance` (0.5%) of the larger drawing's size per control point count as identical.
- Seam: an unclosed subpath whose ends are within `seamTolerance` (2%) of its perimeter is closed; farther apart it is `not-closed`.
- Rest-pose frames sit on the authored outline within 0.5 units (bend, 48-point handoff polylines; trace and match, exact anchors measured against a 720-point sampling of the outline).
- No frame self-intersects at the eight bake samples or at 21 evenly spaced runtime progress values; the trace method checks the rest poses and nine points between (so a drawing that crosses itself at rest is refused, and a crossing that opens and closes between coarser samples is caught), and the bend method checks nine points. The check is chord-based (sixteen chords per curve): the whole loop is flattened into one polyline, so two adjacent curves that cross away from their shared anchor and a loop of only one or two curves are caught; each curve is also tested for a knot inside itself; collinear segments that retrace each other count as crossings. A crossing narrower than the chord resolution can escape, so this is a heuristic, not a proof of simplicity. Parallel-segment and straight-segment tests are relative to the segments' own lengths.
- `handoffPoints` under 8 is raised to 8. A basic shape with a zero or negative width, height or radius yields no geometry, as SVG would not render it.
- Every builder drops coincident anchors and snaps a seam within `seamTolerance` (2% of the perimeter, inclusive) shut; a wider gap gets a closing edge in the builders and is refused as `not-closed` by `morphSubpaths`.
- An aperture edge whose tips coincide is `degenerate-edge` and never paired. The facing side of each edge is chosen at whichever of eleven progress samples has the edges farthest apart, and closure is judged relative to the edges' extent at that progress, so no unit floor closes a small opening.
- The bend method's mid-morph area holds at or above 0.62 of the thinner endpoint's area, and a rounded tip's width a short way in from the tip stays within 40% of the rest poses' widths.
- Aperture tips count as adjacent within 20% of the shorter tip-to-tip span, floored at 4% of it; a closed aperture's area is at floating-point noise (under 1e-6 square units).
- Eight samples keep the linear blend within 0.23 units of the exact frame on the lash fixture; four samples reach 1.24 and sixteen 0.17. Eight is the initial tuning point, not a guarantee for every drawing.

## Tests

```bash
cd packages/spark-morph && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run --no-file-parallelism
```
