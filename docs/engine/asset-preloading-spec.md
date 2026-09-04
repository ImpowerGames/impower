# Asset preloading and unloading

This document specifies how the Spark engine loads assets ahead of need, waits for them when it must, and releases them. It is the reference for the `sceneAssets` compiler channel, the `assets/*` message protocol between the engine and the page, the `load` syntax, the `loading` layout, and the `assets` config block.

## Goals

A portrait, backdrop, font, or sound is never shown or played late. In the editor's cursor preview, clicking around inside a scene never waits on a fetch after the first click into that scene. In play, lines are not delayed by loading, memory stays bounded, and an author can put a customizable loading screen at any scene transition.

## Model

Two loaders share one cache.

Dynamic prediction runs by default. From the current beat, the engine keeps the assets of the next `predict_distance` beats loading, through every branch in document order, spilling into the scenes the current one loads or diverts to. Prediction never blocks; it fills the cache while the reader reads.

Explicit loads are written by the author. `-> load Name` shows the `loading` layout, loads scene `Name`'s assets (and a world named `Name` if one is defined), hides the layout, and diverts. It is the one-token form of Ren'Py's show-a-screen, `start_predict` everything, `pause predict=True`, hide, jump.

Every line waits for its own images and audio before it displays. That wait is the correctness backstop; prediction is what makes it rarely wait.

## Units

A scene (`scene … end`, an ink knot whose runtime paths start with the scene name) is the unit of loading. A branch (`branch … end`, a stitch inside the scene) shares the scene's set. Functions called from a scene do not count as leaving it. Root-level content is the pseudo-scene `0`.

## Asset kinds

Visual: images, including filtered (`name~filter`) and layered (`a+b`) variants, and fonts. Timed: audio and video.

Preview loads the visual group only, and in preview the whole scene's visuals are prefetched when the cursor enters the scene, because the cursor moves arbitrarily and a forward window is not enough. Play loads both groups.

Fonts load per layout. A font is needed by a layout when a style that applies to that layout's elements references it, directly by family name or through the `--font-<name>` variable. The fonts of `main` load at connect; the fonts of another layout load when it opens (and are prefetched when a predicted beat opens it); a layout's fonts are released when it closes.

Synth audio (character voices, the typewriter) is generated per line with a tone suffix in its key and is never cached. A synth buffer lives on its player and is dropped when the player stops.

Video is a cache kind so the loader is ready when playback lands. Playback is a separate effort; its contract is at the end of this document.

Worlds (authored JavaScript modules) load only in play, through `load`.

## The cache

One cache on the page, sized by `asset_cache_size` megabytes. `0` means never evict. Entries are keyed by image src, font src plus descriptors, audio load key, or video src. An entry is resident when its bytes are local and usable: an image after its `load` event, a font after its `FontFace` is added to `document.fonts` and loaded, audio after `decodeAudioData`, video once its bytes are held in a blob with an object URL. The `load` and `error` events are the completion signals for images because they fire as soon as the bytes arrive, wherever the page is. `decode()` is only a warm-up on top: the cache asks for it after `load` and waits at most `decodeTimeoutMs` (1.5 s) for it, because Chromium settles that promise as part of producing a frame, so it never settles while the page produces no frames (a hidden tab, a throttled embedded view) and can reject for reasons unrelated to the image.

Bytes are estimated per kind: images as `naturalWidth * naturalHeight * 4` with a floor of 256 KiB and, for SVG variants, a floor of 4 MiB; fonts and video by response size; audio as `length * numberOfChannels * 4`.

Pinned entries never evict. Pinned: what is displayed, playing, or used by a mounted layout; the sets brought in by explicit loads while their scene is current or on the ink callstack; the assets a line or layout mount is waiting on.

When the total exceeds the cache size after an item becomes resident, unpinned entries that were not touched this tick are evicted least-recently-used first. Dropping an image releases the element; a font goes through `document.fonts.delete`; audio drops the buffer; video revokes the object URL.

## Unloading follows the arrows

`-> load Y` from scene X replaces X: X's explicitly loaded set is dropped as soon as Y is entered, except what Y also uses or what is still displayed or playing.

`-> load Y ->` (tunnel) and `<- load Y` (thread) return to X, so X's set stays pinned until Y returns, and Y's set is dropped when it does.

Assets brought in by prediction are never dropped early; the cache size decides.

## Partial loads

`load_distance` caps how many beats of a scene a `load` waits for. `0` means the whole scene.

If a scene's set would exceed `asset_cache_size`, the load pins as much as fits in flow order, warns once in the console, and prediction streams the rest. A load never blocks on more than the cache size. Pinned entries are exempt from eviction, so the cache size is exceeded only when a single load set is larger than the whole cache, and then only by what could not be pinned.

## Requests, pins, and priorities

Requests carry a priority and, when they must be waited for or kept, a pin.

Priority 0 is the express lane: a line's gate, the checkpoint restore gate, and a layout mount's fonts. Two of the six concurrent request slots are reserved for it. Priority 1 is an explicit load's set. Priority 2 is the prediction window and the preview cursor-scene prefetch. Priority 3 is the window's spill into loaded and successor scenes. A later request for a queued key at a better priority moves it forward.

Pins: `restore` (released when the restore gate settles), `beat:<id>` (released when the line displays), `layout:<name>` (released when the layout closes), `load:<flow>` (released, and dropped, when the flow leaves the callstack). The page derives two more pins itself and never receives them: the srcs of the image elements currently in the overlay, and the keys of audio players currently playing.

Six requests may be in flight at once. Assets are served through a service worker that relays to the editor, so an unbounded burst puts the first-needed asset behind every other one. A request that fails is retried up to three times, then left alone for five seconds; a request after that cool-down starts a fresh set of attempts, and a change to the file clears the failure at once. The cool-down exists because a cold editor start can answer the first requests with 404s before its service worker and file mirror are ready, and those files must not stay blacklisted for the session.

## Message protocol

Messages travel between the engine (`AssetModule`) and the page (`AssetManager`). Progress is a notification because the engine routes requests only to its first module.

```ts
type AssetItem =
  | { kind: "image"; src: string }
  | { kind: "font"; src: string; family: string; weight?: string; style?: string; stretch?: string; display?: string; unicodeRange?: string }
  | { kind: "audio"; params: LoadAudioPlayerParams }
  | { kind: "video"; src: string };

// assets/configure  notification  { cacheBytes: number }
// assets/load       request       { items: AssetItem[]; priority: 0 | 1; pin: string; pinBudget?: number }
//                                 -> { loaded: string[]; failed: string[]; pinned: string[] }
// assets/prefetch   notification  { items: AssetItem[]; priority: 2 | 3 }
// assets/release    notification  { pins: string[]; drop: boolean }
// assets/progress   notification  (page -> engine) { pin: string; loaded: number; failed: number; total: number }
```

`assets/load` resolves when every item is resident or has failed; a failed item counts as settled so a gate never waits for ever. The page pins the loaded items in order while the total of pinned bytes stays under `pinBudget`, or under its own cache size when the request carries none, and reports which ones it pinned; the rest stay resident but unpinned. `assets/release` with `drop` evicts what is left unpinned immediately, unless a derived pin still holds it. A queued item that a drop leaves unpinned is cancelled rather than loaded for nothing.

The page answers every `assets/load`, including one with no items. Every engine emit path is guarded so the never-connected route-simulation game emits nothing.

## Waiting

A line waits for the images its instructions show and the audio they play. Loads for both start in the same call, so the wait is the slower of the two, not the sum. `beat_timeout` bounds the wait; on timeout the line displays anyway and a warning names the missing keys.

A layout mount waits for its fonts.

A checkpoint restore waits for the images and fonts the checkpoint displays, bounded by `restore_timeout`. Preview has no running clock, so this is how preview avoids showing a restored backdrop late.

A `load` beat waits for its pinned set and its world, bounded by `load_timeout`, and for the loading layout's minimum display time.

Nothing else is waited for. Instant displays and route simulation bypass every wait.

## The `sceneAssets` channel

The compiler publishes `program.sceneAssets`, keyed by top-level flow name (a scene, a function, or `0` for root content), the same key `Game.getSimulateFromPath` produces from a runtime path.

```ts
interface SceneBeat {
  path: string;
  image?: string[];
  audio?: string[];
  layouts?: string[];
  loads?: string[];
}
interface SceneAssets {
  kind: "scene" | "function" | "root";
  beats: SceneBeat[];
  image: string[];
  audio: string[];
  layouts: string[];
  loads: string[];
  successors: string[];
  calls: string[];
  dynamic?: true;
  dynamicBases?: string[];
}
```

`beats` lists, in document order, every runtime leaf that references an asset, with the names it references. Document order is execution order for straight-line content; branches follow in document order. Image names are the tokens after `+` splitting, verbatim (`bunny~hat` stays `bunny~hat`; the engine canonicalizes). Audio names are bare asset names. `layouts` holds the targets of `[[open …]]` and `[[navigate … to …]]`. `loads` holds the targets of `[[load …]]`, which every `load` arrow lowers to.

`image`, `audio`, `layouts`, and `loads` are the unions over the flow's beats, in first-use order, including the beats of every function the flow calls. `successors` lists the flows reachable by absolute diverts, tunnels, and threads, excluding the flow itself and functions. `calls` lists the functions invoked. `dynamic` marks a flow whose directives or diverts contain names only knowable at runtime; the static set is then a subset, and `dynamicBases` carries the static prefix of each dynamic image name so variants of that base can be warmed.

The channel is captured during the runtime-tree location walk, which is incremental per flow: a flow whose source did not change contributes its cached capture without being walked. The channel is absent when the compile threw.

Names that cannot be known statically are handled at runtime: the interpreter reports every asset name it parses before the line's gate runs, so an interpolated name is in flight as early as it can be.

## Prediction

The engine keeps a per-flow index from runtime path to beat index. From the current path it takes the beats after the current one, up to `predict_distance` (or the rest of the flow when `0`). When the window passes the end of the flow, it continues into the flow's `loads` targets, then its `successors`, each from its first beat, until the distance is spent. It resolves every image, every font of every layout, and, in play, every audio and video name in the window, and prefetches them at priority 2 (spill at 3). The window advances at scene entry and after every displayed beat. In preview, the window is replaced by a prefetch of the whole scene's visuals when the cursor enters the scene.

## Scene entry

The engine detects a scene change when the first segment of the runtime path changes to a flow that is not a function. Every module receives `onEnterScene(scene, previous, stack)`, where `stack` is the set of flows on the ink callstack, the flows a tunnel or thread will return to. The asset module then releases, with drop, every `load:` pin whose flow is neither the new scene nor on the stack, and runs prediction (or, in preview, the whole-scene prefetch).

## The `load` syntax

`load` may precede the first target of a divert, a tunnel call, or a thread: `-> load Name`, `-> load Name ->`, `<- load Name`. Each lowers to the directive `[[load Name]]` on its own line followed by the arrow. A tunnel-onwards or a multi-target chain with `load` is a diagnostic.

`[[load Name]]` and `[[load Name with fade]]` also work on their own, to load a world without changing scene, or to choose the transition. The directive starts its own beat so the loading screen never appears over a line of dialogue. The legacy `load <name>` action line produces the same beat.

A `load` beat: opens the loading layout with the `with` transition or `loading_transition` (adopting it if the author already opened it); requests the scene's beats in order, all or the first `load_distance`, at priority 1 under pin `load:<name>` with the remaining cache size as its pin budget; loads world `Name` if `context.world` has it; writes progress into the layout; and when everything settles (or `load_timeout` elapses, with a warning) and `loading_min` has passed, closes the layout the way it opened and lets the beat advance. `load` requires a flow named `Name` when written on an arrow; `[[load Name]]` accepts a world-only name; a name that matches neither warns and continues.

In preview a `load` beat only prefetches the scene's visuals: no layout, no world, no wait. Route simulation skips it entirely.

## The `loading` layout

`loading` is an engine-managed layout, like `main`: navigation never closes it, checkpoints never record it, restores never mount it, and opening or closing it during preview or simulation is a no-op.

The built-in layout is a full-screen backdrop with a centered progress bar. Its root style carries `z_index = 1000` and `pointer_events = auto`, so it stacks above every other layout and swallows clicks. Authors replace it with `layout loading with … end` and restyle it with `style loading with … end`; both work with no engine involvement. Progress reaches the layout through the reactive `game.loading` table, a builtin define with no `store` props (so nothing of it is saved): the engine writes `active`, `name`, `loaded`, `total`, `progress` (0 to 1), and `percent` (0 to 100) into the live table in place, records the table as a reactive change, and refreshes the mounted layouts, so only the bindings that read it re-run. The built-in bar is `loading_fill #transform="scaleX({game.loading.progress})"`; a replaced tree binds the same values, for example `text "Loading {game.loading.percent}%"`.

## Config

```sparkdown
define assets as config with
  predict_distance = 32
  asset_cache_size = 300
  load_distance = 0
  beat_timeout = 8
  restore_timeout = 2
  load_timeout = 30
  loading_min = 0.5
  loading_transition = "fade"
end
```

`predict_distance` is a count of beats; `0` means the rest of the current scene. `asset_cache_size` is in megabytes; `0` means never evict. `load_distance` is a count of beats; `0` means the whole scene. The timeouts and `loading_min` are seconds. `loading_transition` names a transition or animation. Authors override any key with `define assets as config with … end`; unauthored keys keep their defaults.

## Why background loading works in a browser

The browser does the heavy work on its own threads; the page's main thread only starts requests and handles completions. Network transfers run in the network process. Image decoding runs off the main thread when requested through `img.decode()`. `decodeAudioData` decodes on a dedicated audio thread. `FontFace.load()` fetches and parses off the main thread. Video buffers through the media pipeline. The service worker that filters SVGs runs on its own thread. The one exception is SVG, whose document is parsed on the main thread when the image loads, once per variant as its own task, and rasterized when painted, cached by the browser per rendered size. Prediction moves the parse off the critical moment; the paint cost stays. Measured on 2026-09-03 with the Raffles and Bunny art, cold, headed Chromium, displayed at 1280 by 720: the heaviest SVG portrait (257 KB) costs 15 ms of main-thread parsing once when it loads (`SVGImage::DataChanged`, of which 9.5 ms is the XML parse) and at most 5 ms to paint; the median portrait (68 KB) costs 6.5 ms and 2.6 ms; no long task appears, and the first frame after inserting the element arrives in 6 to 8 ms. The largest backdrop, a 2.6 MB WebP at 4745 by 1080, decodes for 93 ms entirely on the compositor worker thread with the same 6 ms first frame. Both are under one frame on the main thread, so no rasterized variant is planned. The rule stands if heavier art arrives: a variant that costs more than a frame to load or paint gets a cached `?raster=<w>` variant produced in the service worker beside `?filters=`, with a main-thread fallback where `createImageBitmap` cannot decode SVG. Filtered variants add a filter pass at paint time on top of these numbers and were not measured.

## Video playback contract

Video playback is a separate effort. This system guarantees it: a `video` asset type in `program.assets` and `context.video`; `sceneAssets` image names that resolve to videos; a resident object URL from the cache for any predicted or explicitly loaded video; the same per-line gate, so a beat that starts a video waits for it the way a beat waits for its audio; and eviction through the same pins. The surface follows Ren'Py's two movie forms: a video name in `[[show LAYER NAME]]` plays on that layer like an animated image (looping by default, `once` plays through and holds the last frame, `mute` silences it, `[[hide LAYER]]` stops it), and `[[play NAME]]` is the full-screen cutscene that ends when the video ends or the player clicks and then continues the story (`loop` until a click; `movie.stop_music` stops the music channel for its duration). The work, including the validator, reference, completion, scene-asset, interpreter, coordinator, and page plumbing, is issue #398. The playback design: a `<video>` element created for names that resolve to `context.video`, playback tied to the game clock, audio routed through the mixer, and preview showing the first frame only.

## Phases

1. Compiler: `sceneAssets`, the directive scanner, `video` as an asset type.
2. Engine: scene tracking, the asset module (resolution, prediction, gates, `load` beats, pins), the coordinator gate, the interpreter's `load` verb.
3. Page: the asset cache, the asset manager, the shared cache across play sessions, font and synth ownership, the preview cursor-scene prefetch, the SVG measurement.
4. Syntax, config, and the loading layout: `load` on arrows and in directives, `define assets as config`, the built-in `loading` layout and its protections, documentation.
