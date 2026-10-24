# Morph bake

A `morph` declaration (see `../compiler/morph/`) says how a portrait moves between its drawn states. This directory turns that declaration and one image variant's artwork into an artifact a player can animate: ordered render parts, numeric frames for every moving drawing, the apertures that clip eyeballs and shadows, and a static rest render with those apertures applied. The geometry itself comes from `@impower/spark-morph`; this code finds the drawings, decides what pairs with what, and packages the result.

Every host runs the same code. The bake (`bake.ts`) is a pure function of the artwork text, the variant's attribute selection and the morph's recipe. Hosts differ only in where the artwork comes from and who keeps the result (`hosts.ts`, `assetService.ts`).

## What compilation emits

Compilation never bakes. Binding a morph to images needs only the attribute vocabulary, which every host has, while baking needs the SVG source, which the web editor's compiles do not carry. So the compiler fills `program.morphs` (`channel.ts`) with two tables:

- `recipes`: each morph's `MorphRecipe` as canonical JSON, once per morph. A recipe holds the transition policies, the keyframes' state selections and the clip entries after inheritance. Timing and layer poses are not in it, so retiming a blink does not invalidate any baked geometry.
- `variants`: for each image variant a morph plays on (an `active` binding: compatible groups, resting where the morph starts), a `MorphRef` keyed by the variant's context name, the name an image directive resolves to.

A reference is about 600 bytes on a served host and less where the art is inline. It names the morph, the root image, the variant's canonical selection and the groups the morph drives, plus a `key`. The key is a hash of the bake format, the artwork's version (its served `src`, which carries the file signature, or a hash of the inline data), the selection and the recipe text, so anything that would change the artifact changes the key. Dormant variants (explicitly closed eyes) and skipped ones get no reference; compilation reports skipped ones on the morph block.

The channel is built on every compile, with or without validation, and reused while the context revision and the effective morphs are unchanged. It is a separate channel rather than a field on the `filtered_image` structs because those structs are shared between compiles and may only carry derivations of their own inputs, while a reference also depends on the script's morph declaration.

## Resolving a reference

`createMorphHost` resolves a reference through one `MorphBakeService`:

- With `ref.src` and a `fetch`, the asset service bakes. In the web editor `src` is the variant's filtered-image URL (`/file:/…svg?v=…&attributes=…`) with `&morph=<recipe>&key=<key>` appended. The service worker (`impower-dev/src/workers/sw.ts`) and the dev server's mirror both answer it with `serveMorphAsset`: the artifact as JSON, or with `&morph_output=rest` its rest render as SVG. The worker caches artifacts in the `morph-artifacts` bucket by the file's content digest, the selection, the recipe and the bake format, never by the request URL, and prunes superseded signatures of a variant when it writes a new one.
- Without `src`, the host reads the artwork itself and bakes in process: `inlineMorphSource` reads the program's inline `image.data` (VS Code, local compiles), `fetchedMorphSource` fetches the root image's `src` (a player with plain file assets). The language server reads its watched files directly, because it holds every artwork's text on every host.

Readiness is static first. A consumer keeps showing the variant's ordinary `filtered_src` until the artifact arrives, and keeps it for good if resolving fails. `MorphArtifactSlot` packages this for one consumer: `set(ref)` starts a request and abandons the previous one; a result whose key the slot no longer holds is released unseen, so a late bake for an older source or recipe generation never attaches; a failure leaves the slot `failed`, which means "stay static".

Cancellation is per consumer. Aborting a request rejects that caller only; the shared bake is cancelled when no caller is still waiting for it, and the bake observes that between drawings. A caller arriving after everyone else abandoned a bake starts a fresh one.

## Caching and lifetime

`MorphBakeService` coalesces concurrent requests for one key into one bake and reference-counts what it keeps. A `MorphHandle` holds one reference until `release()`. Unreferenced artifacts are evicted oldest-use-first once the service holds more than `maxArtifacts` artifacts or `maxBytes` of unreferenced ones; referenced artifacts are never evicted. `handle.url(…)` creates an object URL for the rest render or a part on first use, and the service revokes it when the artifact leaves the cache. `onEvent` reports each bake (with its time and size) and each eviction, so a host can watch its cache. `invalidate` drops the artifacts of an edited or deleted artwork; one still held goes when its last handle is released, and new requests bake again. Edits change keys anyway, so invalidation only returns memory sooner.

Reusable geometry is kept apart from consumer-specific artifacts. The service keeps one geometry cache per artwork content (bounded by `maxSources` and `maxGeometryPerSource`) holding the root-space morph result of each drawing pair and method (failures included, so a cached bake reports what a fresh one would), its sampled frames in each element space, and the aperture samples of each edge set. Variants of one artwork that differ in groups the morph does not drive (an outfit, a gaze) reuse all of that instead of searching for the same correspondences again; only parts and visibility are rebuilt, a few milliseconds on the test fixtures against hundreds for a first bake. The defaults in `MORPH_CACHE_DEFAULTS` are starting bounds, not measured budgets.

## What a bake does

1. Reads the artwork with the attribute module's own walk, so every element carries the layer key visibility is evaluated with.
2. Binds the variant with the same rules compilation used (`bindVariant`). A variant that is no longer active, because its art changed since compiling, bakes to a static artifact with a diagnostic.
3. Builds each driven group's schedule. A keyframe state equal to where the morph starts is the variant's own resting choice, so an authored `open-wide` returns to `open-wide`, and each folder keeps its own default. An omitted first or last keyframe is the resting state, as in CSS.
4. Evaluates visibility for each state of each group with the others at rest, without publishing the probe-only diagnostics (`look-with-closed-eyes`) a hypothetical selection raises. A layer whose visibility changes with a group belongs to it; a layer two groups both switch is an error.
5. Splits paint order into runs of static and live leaves. Live leaves are the groups' state layers and every clip target; a compositing ancestor (opacity below 1, a filter, a mask, a blend mode, isolation) that holds both makes all of its leaves live, because splitting it would change how it composites. Each run becomes a part: a full SVG document with the root's sizing, every ancestor's transform and inherited style, all `<style>` sheets, and the transitive closure of the resources it and those sheets reference (gradients that inherit gradients, clip paths whose contents use patterns, a gradient only a class rule names). Ids are namespaced under the artifact's prefix and every supported reference is rewritten: `url(#…)` in attributes and style text, `href`/`xlink:href`, and `#id` selectors in style sheets.
6. Pairs each segment's appearing and disappearing drawings by identical nonempty effective label (the nearest labelled ancestor's) with `pairShapes`, in root user space, so ancestor transforms are honoured. Each drawn element is a pairing unit; a labelled group's elements all carry its label. Unlabelled drawings never pair.
7. Applies policy, resolved field by field from the nearest configured label up to the root: `blend = morph` runs the explicit `method`, falling back with a diagnostic when it fails; `fade`, `cut` and `scale` apply to paired and unpaired drawings alike; an unpaired drawing under `blend = morph` uses its `fallback`. A drawing inside a clip target holds through the segment instead, so the moving aperture alone decides what shows.
8. Forms apertures from each clip entry's `between` edges: the bend tracks of the paired drawings with those labels (two open lashes converging on one closed lash are two tracks and one aperture). Edges that are not bend morphs, compound edges, a lone edge, three edges sharing tips, an edge inside its own target, or edges that never move disable the morph for the variant with a diagnostic. An aperture that closes to nothing is valid.
9. Wraps each clip target in a group clipped by its entry's aperture, mapped from root space into the wrapper's space, in both the live part and the rest render. The target's own clip paths and masks stay on it, so they intersect. The rest render is the variant's static render, unchanged except for those wrappers and their clip paths.

Frames are sampled at `MORPH_BAKE_SAMPLES` (8) evenly spaced progress values, the geometry package's tuning point, and mapped into the moving element's own user space so a player sets its `d` directly. A segment that moves the same drawings back reuses the earlier segment's frames and apertures reversed; geometry lives in the artifact's `frames` and `apertures` tables and transitions point into them.

## Playing an artifact

`render.ts` draws an artifact at any pose as one SVG and is the executable statement of these rules; a live player follows the same ones.

- Parts paint bottom to top and overlay exactly (they share the root's view box and sizing). Static parts never change. A player drawing several inline copies of a live part gives each copy its own id prefix with `namespaceMorphMarkup`.
- A live part's markup is the rest pose: leaves another state shows carry `display="none"`, so the parts composed as written match the rest render. At a keyframe, a group shows the leaves `visibility[group][state]` lists and hides its others; leaves outside every group are always drawn.
- Progress arrives already eased by the morph's timing; nothing here eases again. Within a segment, a frame blends its two nearest samples linearly, from the last sample backwards when the geometry reference is `reversed`.
- At either end of a segment the authored drawings show as they are, never their sampled frames: the start pose is the `from` leaves' own geometry and the end pose the `to` leaves'.
- `morph`: between the ends the `draw` leaf takes the blended geometry, and at the end the `to` leaf's own drawing takes over, so a destination several tracks share is drawn once. `draw` is the `from` leaf, except where several tracks leave one drawing (a closed lash opening into two): one element cannot carry two shapes, so each track draws on its own destination and the shared source is hidden between the ends. `fade` multiplies the leaves' own opacity; `cut` holds `from` until the end; `scale` follows its frames and is invisible at its zero endpoint; `hold` stays drawn.
- A clip entry's aperture in a segment is that segment's `apertures` entry, written into every clip path `clipTargets` lists for the entry; outside its segments an aperture keeps its last pose.

## Diagnostics

A bake reports what it could not do as `MorphBakeDiagnostic`s with the morph, layer and element they concern; their `uri` and `variant` name the consumer the bake ran for. Several consumers can share one artifact key (the same art in two files, two names for one selection), so the language server bakes each key once and publishes its diagnostics on every artwork whose reference has that key, through the existing asset diagnostic delivery and merged with the compile's own. Each problem shows once per artwork, naming every variant it affects. A drawing pair that fails in one segment and again in the segment that moves it back is one problem. Declaration problems stay on the morph block, where compilation puts them. Intentional one-sided art, `blend = cut` flipbooks with no pairs, and a closed-eye aperture of zero area are not reported.

## Limits

- One morph's rest apertures per preview: a variant two clipping morphs play on previews with the first one's.
- A pairing unit is one drawn element. Art that splits one shape across several elements with different paint pairs element by element.
- Text, images and `<use>` instances inside state layers fade or cut; they have no geometry to morph or scale.
- A `<use>` that points into a group split between parts draws only what its own part carries of that group.
- Drawings and clip targets inside a nested `<svg>` viewport are not mapped; a drawing there fades instead of moving, and a clip target there disables the morph, each with a diagnostic.
