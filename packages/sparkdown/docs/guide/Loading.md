# 9. Loading and preloading

The engine loads a scene's images, fonts, sounds, and video before the story needs them, so nothing appears or plays late. Most of this is automatic. This chapter covers what happens on its own, the `load` arrow for chapter transitions, and how to restyle or replace the loading screen.

## 9.1 What happens on its own

While the story runs, the engine keeps the assets of the next few beats loading in the background, through every branch, and follows the scene's diverts into the scenes it can reach next. Every line still waits for its own images and audio before it displays, so a slow connection delays a line rather than showing it without its portrait.

Once a line has finished typing and no move or transition is running, the player also draws the pictures of the lines ahead, nearest first and through every branch, so the next line does not wait for them. Each picture is drawn at the largest size it reaches while it stays on screen over those lines, from its framings, its style scale and the scale keyframes of its effects, so a later zoom does not draw it again. A looping idle animation does not hold this back, a click that skips the typing starts it at once, and any click or key stops it. In the editor's preview the pictures of the lines on either side of the cursor are drawn the same way.

In the editor's preview, the line under the cursor waits for its own images before it shows, the beats around the cursor load first, and the rest of the scene loads behind them, because the cursor can land anywhere inside it.

Fonts load per layout. A font is loaded when a layout whose styles use it mounts, and released when that layout closes. The fonts `main` uses load at connect.

```sparkdown
define assets as config with
  predict_distance = 32
  predict_cache_size = 300
  load_distance = 0
  load_cache_size = 0
  trim_layers = true
  beat_timeout = 8
  restore_timeout = 2
  load_timeout = 30
  loading_min = 0.5
  loading_transition = "fade"
  morph_frame_rate = 24
end
```

| Key | Meaning |
| --- | --- |
| `predict_distance` | Beats ahead of the current one whose assets keep loading; in the editor's preview, beats on either side of the cursor. `0` means the rest of the current scene. |
| `predict_cache_size` | Megabytes prediction may keep loaded. What is on screen, playing, mounted, or brought in by `load` does not count; beyond it the least recently used prediction assets are dropped. Pictures drawn ahead count too, each canvas and frame at its drawn width times height times four bytes: when they do not fit, the drawings for the lines furthest ahead are dropped first, and a drawing a shown line uses is never dropped. `0` means never drop any. |
| `load_distance` | Beats of a scene a `load` waits for. `0` means the whole scene. |
| `load_cache_size` | Megabytes `load` may keep pinned across the loaded scenes still on the callstack. A scene beyond it keeps what fits, in flow order, and streams the rest as it is reached. `0` means no cap: a `load` keeps its whole scene. |
| `trim_layers` | Whether each layer file of a layered picture is cut to the box of its painted pixels as it loads, and counted at that size against `predict_cache_size` and `load_cache_size`. Pictures look the same either way; `false` only stops the cutting. Single images, SVG files and masks are never cut. |
| `beat_timeout` | Seconds a line may wait for its assets, and for its [pictures to be drawn](./Portraits.md#how-pictures-are-drawn-before-a-line-shows), before displaying anyway. `0` means never time out. |
| `restore_timeout` | Seconds a checkpoint restore or a layout mount may wait for its assets. In the stopped preview, the seconds a line may wait for its pictures to be drawn. `0` means never time out. |
| `load_timeout` | Seconds a `load` may wait before giving up and continuing. `0` means never give up. |
| `loading_min` | Seconds the `loading` layout stays up once a `load` opened it. |
| `loading_transition` | Transition used to open and close `loading` when `load` has no `with` clause. |
| `morph_frame_rate` | Frames a second a drawn portrait's smooth morph is [drawn at before its line shows](./Portraits.md#how-pictures-are-drawn-before-a-line-shows). A morph whose easing is `steps(...)` keeps its own count. `0` means a smooth morph holds the rest pose. |

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
scene start
  -> load Interlude ->
  <- load Sidebar
end
```

A tunnel and a thread come back to the scene that called them, so that scene keeps its loaded assets while they run; the called scene's assets are released when it returns.

## 9.3 The `load` directive

`load` is also a directive, for loading without changing scene or for choosing the transition:

```sparkdown
scene start
  [[load Chapter2 with fade]]
  [[load Gallery Credits]]
end
```

The directive loads each named scene or world in turn behind the loading screen. A `load` on an arrow is the same as writing `[[load Name]]` on the line before the arrow.

## 9.4 Restyling or replacing the loading screen

The loading screen is the built-in `loading` layout. Restyle it the way you restyle any layout:

```sparkdown
style loading_backdrop {
  background_color = black
}

style loading_fill {
  background_color = gold
}
```

Or replace it entirely:

```sparkdown
layout loading {
  column {
    text "Loading {game.loading.name}… {game.loading.percent}%"
    loading_bar {
      loading_fill #transform="scaleX({game.loading.progress})"
    }
  }
}
```

While a load runs, the engine keeps the `game.loading` table up to date, and any binding in your layout can read it: `game.loading.percent` is a whole number from 0 to 100, `game.loading.progress` the same value from 0 to 1, `game.loading.loaded` and `game.loading.total` the counts behind it, `game.loading.name` the scene or world being loaded, and `game.loading.active` whether a load is running. The built-in bar is nothing more than `loading_fill #transform="scaleX({game.loading.progress})"`, so a replaced layout can scale, show, or hide anything the same way. None of it is saved into checkpoints.

## 9.5 Video

When the game is playing, video files load alongside audio as the story approaches them, and a line that shows a movie or plays a cutscene waits for its file like a line waits for its sound. A movie on screen keeps its file loaded until it leaves. The editor's preview loads no video ahead of time; it reads only the start of a file to show its first frame. [Video](./Video.md) covers playback.
