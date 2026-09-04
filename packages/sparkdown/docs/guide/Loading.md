# 9. Loading and preloading

The engine loads a scene's images, fonts, sounds, and video before the story needs them, so nothing appears or plays late. Most of this is automatic. This chapter covers what happens on its own, the `load` arrow for chapter transitions, and how to restyle or replace the loading screen.

## 9.1 What happens on its own

While the story runs, the engine keeps the assets of the next few beats loading in the background, through every branch, and follows the scene's diverts into the scenes it can reach next. Every line still waits for its own images and audio before it displays, so a slow connection delays a line rather than showing it without its portrait.

In the editor's preview, entering a scene loads that scene's visuals, because the cursor can land anywhere inside it.

Fonts load per layout. A font is loaded when a layout whose styles use it mounts, and released when that layout closes. The fonts `main` uses load at connect.

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

| Key | Meaning |
| --- | --- |
| `predict_distance` | Beats ahead of the current one whose assets keep loading. `0` means the rest of the current scene. |
| `asset_cache_size` | Megabytes of loaded assets to keep. Assets brought in by `load` stay pinned while their scene is current or on the callstack; the rest are evicted least recently used first. `0` means never evict. |
| `load_distance` | Beats of a scene a `load` waits for. `0` means the whole scene. |
| `beat_timeout` | Seconds a line may wait for its assets before displaying anyway. |
| `restore_timeout` | Seconds a checkpoint restore or a layout mount may wait for its assets. |
| `load_timeout` | Seconds a `load` may wait before giving up and continuing. |
| `loading_min` | Seconds the `loading` layout stays up once a `load` opened it. |
| `loading_transition` | Transition used to open and close `loading` when `load` has no `with` clause. |

Override any key with `define assets as config with … end`; the keys you leave out keep their defaults.

## 9.2 The `load` arrow

Put `load` after an arrow to load the whole target scene behind a loading screen before going there:

```sparkdown
scene Chapter1
  N: The road ahead is long.
  -> load Chapter2
end
```

`-> load Chapter2` opens the `loading` layout, loads every asset `Chapter2` references (and a world named `Chapter2`, if one is defined), waits for at least `loading_min` seconds, closes the layout, and diverts. Leaving `Chapter1` this way releases the assets `Chapter1` had loaded, except anything `Chapter2` also uses or anything still on screen or playing.

The same keyword works on a tunnel and on a thread:

```sparkdown
-> load Interlude ->
<- load Sidebar
```

A tunnel and a thread come back to the scene that called them, so that scene keeps its loaded assets while they run; the called scene's assets are released when it returns.

## 9.3 The `load` directive

`load` is also a directive, for loading without changing scene or for choosing the transition:

```sparkdown
[[load Chapter2 with fade]]
[[load Gallery Credits]]
```

The directive loads each named scene or world in turn behind the loading screen. A `load` on an arrow is the same as writing `[[load Name]]` on the line before the arrow.

## 9.4 Restyling or replacing the loading screen

The loading screen is the built-in `loading` layout. Restyle it the way you restyle any layout:

```sparkdown
style loading with
  background_color = black
end

style loading_fill with
  background_color = gold
end
```

Or replace it entirely:

```sparkdown
layout loading with
  column:
    text "Loading…"
    loading_bar:
      loading_fill:
end
```

While a load is in progress the engine writes `--loading_progress`, a number from 0 to 1, on the layout's root element. Any element in your layout can read it with `var(--loading_progress)`; the built-in `loading_fill` scales its width by it. Keep `loading` out of any `screen`: it is engine-managed, never navigated away from, never recorded in a checkpoint, and never shown in the editor's preview.

## 9.5 Video

Video files are loaded alongside audio when the story approaches them, so they are ready the moment playback support lands. Playback itself is a separate feature.
