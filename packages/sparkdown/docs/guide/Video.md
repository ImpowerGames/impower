# 14. Video

A video file plays in two ways. On a layer, it is a moving image: an animated portrait, a sprite, a backdrop with rain falling. As a cutscene, it covers the whole screen, plays to its end or until the player clicks, and then the story goes on. Both follow Ren'Py's movie features: a layer movie is its `Movie` displayable, and a cutscene is its `renpy.movie_cutscene`.

## 14.1 Video files

Add a video file to the project the way you add an image. The editor recognizes `.mp4`, `.webm`, `.mov`, `.m4v`, `.ogv` and `.mkv` files as video, lists them with the project's assets, and names each one after its file: `intro.webm` is the video `intro`.

A video hosted somewhere else is defined by its address:

```sparkdown
define rain as video with
  src = "https://media.example.com/rain.webm"
end
```

A video served from another origin needs CORS headers (`Access-Control-Allow-Origin`) on its responses. The player loads every movie in CORS mode so that its sound can go through the game's mixers, and a host that sends no CORS headers fails to load at all.

A name belongs to one kind of asset. A name that is both an image and a video is an error the editor reports, because `[[show portrait bunny]]` could not tell which one you meant.

## 14.2 Movies on a layer

Put a video name where an image name goes:

```sparkdown
[[show portrait bunny_idle]]
BUNNY:
  Hello again.
```

The video plays on the `portrait` layer and loops. Everything you can write after an image works the same way after a video, and three clauses belong to video:

| You write | It does |
| --- | --- |
| `[[show portrait bunny_idle]]` | Plays the video on the layer, looping. |
| `[[show portrait bunny_wave once]]` | Plays it through once and holds its last frame on screen. |
| `[[show portrait bunny_idle loop]]` | Loops, which is what a layer movie does anyway. |
| `[[show backdrop rain mute]]` | Plays it with no sound. |
| `[[show backdrop rain with fade]]` | Fades it in, as an image would. |
| `[[animate portrait with shake]]` | Shakes the layer the movie is on, as it would an image. |
| `[[hide portrait]]` | Stops the movie and clears the layer. |

A movie on a layer does not hold up the story. The next line shows when it would after an image, whether or not the movie has finished.

A video with an alpha channel shows the layers behind it through its transparent parts, so a character sprite can be a video drawn on a transparent background. See [formats](#145-formats) for the files that carry alpha.

## 14.3 Cutscenes

`play` inside `[[ ]]` plays a video full screen, above every layout and the loading screen:

```sparkdown
[[play intro]]
N: The ship was already burning when we woke.
```

The cutscene plays once. The story goes on to the next line when the video ends, or as soon as the player clicks, taps or presses the key that advances the story; that click or key ends the cutscene and nothing else, so it does not also skip the next line.

| You write | It does |
| --- | --- |
| `[[play intro]]` | Plays once, ending on its own or on a click. |
| `[[play intro loop]]` | Loops until the player clicks. |
| `[[play intro with fade]]` | Fades the cutscene in, and fades it out when it ends. |
| `[[play intro mute]]` | Plays it with no sound. |

`[[play]]` takes exactly one name, and that name has to be a video. Inside `(( ))`, `play` is still the audio verb: `((play music theme))` plays a sound.

When a cutscene starts, the `music` channel fades out, and it stays stopped after the cutscene ends, as in Ren'Py. Start the music again with `((play music …))` where the story wants it back. To keep the music playing through cutscenes, turn this off:

```sparkdown
define movie as config with
  stop_music = false
end
```

The cutscene's backdrop and video are the builtin styles `cutscene` and `cutscene_video`. The backdrop is black and the video is scaled to fit inside the screen. Restyle them as you would any style:

```sparkdown
style cutscene with
  background_color = white
end

style cutscene_video with
  object_fit = cover
end
```

## 14.4 Sound, pausing and the preview

A movie's sound plays through the builtin `movie` channel and its `movie` mixer, so the mixer's volume applies to every movie, on a layer or in a cutscene:

```sparkdown
define movie as mixer with
  gain = 0.5
end
```

`mute` silences one movie and leaves the others alone.

Movies follow the game clock. Pausing the game pauses every movie on screen, and resuming plays them on from where they stopped. Skipping ahead moves each movie forward by the time skipped. Between skips a movie plays on the browser's own clock, which can drift from the game's by a fraction of a second over a long stretch (around a tenth of a second after twelve seconds). The next skip or pause puts it back in step; moving on to the next line does not.

The engine loads a video before the line that shows or plays it, the way it loads images and sounds ([Loading & Preloading](./Loading.md)), and keeps the file while the movie is on screen.

In the editor's Game Preview, a movie shows its first frame and does not play, and only the start of the file is read to find that frame. A cutscene in the preview shows its first frame over the scene. Press PLAY to see a movie move.

## 14.5 Formats

- WebM with VP9 or AV1 is the format to use for a video with alpha, such as a sprite or a portrait. Chrome and Edge decode its transparency; check any other browser you publish for.
- H.264 in an MP4 file is the format Safari plays most reliably. Use it for a cutscene or a backdrop that has to play there.
- Each video has one file for now. A video cannot list several sources for the browser to choose from, so pick the format that suits the browsers you publish for.

Keep video files short and sized for the screen they fill: a looping portrait of a few seconds at the size it is drawn is much smaller than a full-resolution recording, and the whole file loads before its line shows.
