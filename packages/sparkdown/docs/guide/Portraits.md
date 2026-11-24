# Character portraits


A character in a visual novel needs many looks: happy, sad, eyes closed, wearing a coat, holding a phone. Drawing every combination as its own picture does not scale. Three outfits, four expressions and two eye directions are already twenty-four pictures, and adding one hat doubles that.

Sparkdown takes a different approach. You draw the character once as a stack of layers, name each layer so that it says when it should be visible, and the script turns layers on and off by name. One file, any combination.

This chapter shows how to name layers and how to ask for a look from the script. The examples use a character called Mia, and the same rules serve a background whose props change, which the chapter comes to near the end.

## The idea

Every layer has a name. A plain name like `body` or `hair-back` means the layer always shows.

To make a layer conditional, add a space and the condition. The space means "when", and inside the condition a dot means "is":

```
hair-top hat.off        show hair-top when hat is off
hair-under-brim hat.on  show hair-under-brim when hat is on
```

When the script asks for `[[mia:hat]]`, Sparkdown goes through the layers, keeps every layer whose condition is met, hides every layer whose condition is not met, and shows the result. That is the whole system. The rest of this chapter is the naming rules and what the script can ask for.

## A first portrait: a hat, and the hair around it

Mia sometimes wears a hat. A hat changes the hair, so the hair is drawn in three pieces: the hair at the back of the head, which shows either way; the hair pressed flat under the brim, which only makes sense with the hat; and the fluffy top of the hair, which the hat would cover. In the drawing program the layers are named like this, top layer first:

```
hat.on
hair-under-brim hat.on
hair-top hat.off
hair-back
head
body
```

Reading them one at a time:

- `body`, `head` and `hair-back` are plain names, so they always show.
- `hat.on` is the hat itself: show it when `hat` is `on`. A layer can be named by its condition alone, with no name before it.
- `hair-under-brim hat.on` is the flattened hair: show it when `hat` is `on`.
- `hair-top hat.off` is the fluffy top: show it when `hat` is `off`.

A switch is off unless the script turns it on, so nothing has to say which state is the resting one.

In the script:

```
scene start
  [[mia]]
end
```

shows Mia bare-headed. Nothing mentioned the hat, so it is off. The hair top shows; the hat and the flattened hair do not.

```
scene start
  [[mia:hat]]
end
```

turns the hat on. The hat and the flattened hair show, and the hair top hides. Writing a switch's name after `:` turns it on.

This is how any "this part hides when that part shows" relationship works. There is no separate rule to write anywhere else; each layer says when it belongs.

## A choice between several options

Mia has three expressions. Only one can show at a time, so they form a group. A group is a word, the options are the words after the dot:

```
face.sad
face.happy
face.neutral default
head
body
```

`face` is the group; `sad`, `happy` and `neutral` are its options. `default` at the end of `face.neutral default` marks the option that shows when the script does not choose one; read it as "face is neutral, by default". This is the one place the word is needed: a switch rests at `off` on its own, but among three named faces nothing says which one is the resting face unless you mark it.

A switch like `hat` is just a group whose two options are `on` and `off`, with `off` as its built-in default. An explicit `default` can give it a different resting state, as the office lamp example below does.

```
scene start
  [[mia]]          neutral face
  [[mia:happy]]    happy face
  [[mia:sad]]      sad face
end
```

You do not have to say which group `happy` belongs to. Sparkdown looks through the file, finds `happy` in the `face` group, and chooses it there. If you prefer to be explicit, `[[mia:face.happy]]` means the same thing: the condition is spelled in the script as it is spelled in the layer name, after a colon. `[[mia:hat]]` is short for `[[mia:hat.on]]`.

## Combining

Conditions from different groups combine freely:

```
scene start
  [[mia:happy:hat]]
  [[mia:sad:hat]]
end
```

The order after `:` does not matter, except in one case: if you name two options from the same group, the later one wins.

```
scene start
  [[mia:happy:sad]]    sad face
end
```

That rule matters when you give a combination a name of its own and then adjust it, which the section on named looks covers.

## Layers inside layers

Expressions are usually more than one layer: skin, mouth, eyes. Put them inside the expression's layer, as a group or folder in the drawing program:

```
face.happy
    mouth
    eyes
    skin
face.neutral default
    mouth
    eyes
    skin
head
body
```

A layer inside `face.happy` shows only while that layer shows. The inner layers do not have to repeat the condition, so they can have plain names. Two layers may share a name, as `mouth` does here.

## Eyes: two conditions on one layer

Inside each face, Mia's eyes can be open or closed, and when open they can look in different directions. Here is the neutral face in full:

```
face.neutral default
    lids eyes.closed
    pupils eyes.open look.left
    pupils eyes.open look.right
    pupils eyes.open look.camera default
    whites eyes.open default
    mouth
    skin
```

Two new things are happening.

`pupils eyes.open look.left` has two conditions, each after its own space. Read the spaces as "when ... and when ...": show these pupils when eyes is open and look is left. Both have to hold.

`default` at the end of a name marks the layer as part of the resting look, the one you get when the script chooses nothing. Every group named on that layer rests on the option the layer names. `whites eyes.open default` says eyes rest open. `pupils eyes.open look.camera default` says eyes rest open and the look rests at the camera. Mark every layer that belongs to the resting look, the way you would leave them visible in the drawing program.

What the script gets:

```
scene start
  [[mia]]              eyes open, looking at the camera
  [[mia:look.left]]    eyes open, looking left
  [[mia:eyes.closed]]  lids only; the whites and every pupils layer hide, because they all need eyes open
end
```

Notice that `[[mia:look.left]]` did not have to mention the eyes. The `eyes` group fell back to its default, open, on its own.

Each face carries its own eyes, so each face can have its own default look. If the happy face's pupils are marked `pupils eyes.open look.up default`, then `[[mia:happy]]` looks up and `[[mia]]` looks at the camera. The happy face's eye layers can have exactly the same names as the neutral face's; nothing needs a distinguishing word.

## The naming rules

A layer name is words separated by spaces: the layer's own name, then one or more conditions, and optionally `default` at the end. When the condition alone is enough to describe the layer, the name before it can be left out. One space or several count as one separator, and spaces at either end of a name are ignored. A tab in an SVG layer name counts as a space. A no-break space or another character that looks like a space is not a separator: the editor reports the name.

| You write | It means |
| --- | --- |
| `body` | Always visible. A plain name. |
| `hat.on` | Show this layer when the `hat` switch is `on`. A layer can be named by its condition alone. |
| `hair-top hat.off` | Show `hair-top` when `hat` is `off`. A switch is off unless the script turns it on. |
| `face.happy` | Show this layer when `face` is `happy`. `face` is a group; `happy` is one of its options. |
| `face.neutral default` | The same, and `neutral` is the face that shows when the script chooses none. Only a group with named options needs this. |
| `pupils eyes.open look.left` | Show `pupils` when `eyes` is `open` and `look` is `left`. Every condition must hold. |

Rules to keep in mind:

- Use hyphens inside words: `hair-under-brim`, `pupils look.far-right`. A space always separates two words, so it never sits inside a name or a condition. Do not use other punctuation.
- The descriptive name before a condition cannot contain a dot, because a dot always means "is".
- End every layer that belongs to the resting look with `default`. Within one folder, the resting layers of a group must all name the same option; if they name two, the editor reports it. If a group of named options has no resting layer in a folder, nothing from it shows there until the script chooses. A switch, a group whose options are `on` and `off`, needs no marker: it is off until turned on.
- A layer may list several options of one group after the dot, `hand-right arms.down.phone-left`, and then shows for any of them: the right hand is down when the arms are down and also when the phone is in the left hand. Read the extra dots as "or". If this layer ends in `default`, the first option is its resting option. Conditions from different groups still all have to hold.
- A condition matches only the options it names: `arms.phone` shows for `phone` and not for `phone-left`. A layer that serves every way of holding the phone lists each one, `arm arms.phone.phone-left.phone-right`.
- A layer inside a conditional layer inherits the condition and does not need to repeat it.
- Layers may share a name. Give every mouth `mouth` and every set of open eyes `whites eyes.open default` if that is what they are.
- Layer names are checked when the file is loaded into the project. A name that does not follow the rules is reported in the editor's problems panel with the layer name, so a slip never silently changes what a layer means.

## Group, option, or switch?

Deciding which is which comes down to one test: what question does the layer answer about the character, and how many answers can be true at once?

- If the question has exactly one answer at a time, it is a group, and the answers are its options. "Which face?" is a group called `face`. "What are the arms doing?" is a group called `arms` with options `down`, `phone`, `phone-left`, `script`. "Which outfit?" is `clothes`. Name the group after the part or the slot, and the option after the answer. Choosing one option hides the others, which is exactly what you want for things that cannot both be true.
- If the question is yes or no, it is a switch: a group whose only options are `on` and `off`. "Is the hat on?" is `hat`. Gloves, mask, bandage, helmet are switches too. A switch is right for anything that can be added without changing the rest.
- If one thing can only be true while another is, it is a condition, not a new group. The flattened hair is not a kind of hair, it is hair that shows when the hat is on: `hair-under-brim hat.on`.

The three marks follow from that:

- A dot joins a question to its answer: `arms.phone-left`. A second dot lists another answer that also shows the layer: `arms.down.phone-left`.
- A space means "when": it separates the layer's name from its conditions, and one condition from the next. `hand-right arms.down clothes.coat` shows the hand when the arms are down and the outfit is the coat.
- A hyphen joins words inside one name or one option: `hair-under-brim`, `far-right`, `phone-left`.

So for a phone held in the left hand, the question is "what are the arms doing?", and the answer is "holding the phone, in the left hand": `arms.phone-left`. Not `hold-left.phone`, because `hold-left` is not a question about the character, and not `hold.phone-left`, because holding is not a part; the arms are.

## Drawing programs

Sparkdown reads portrait layer names only from `data-name`. SVG `id` values identify resources and references; they never select portrait attributes and do not need to match layer names.

- Affinity Designer preserves the typed name in `serif:id`. Importing or loading the SVG copies that label into `data-name` in the prepared asset. The engine then reads the normalized name. Existing `data-name` values take precedence.
- The portrait optimizer also performs this normalization before optimization. The screenplay project owns that optimizer in its local `packages/animated-svg-optimizer` workspace. After installing dependencies there, `npm run portraits:watch` preserves author labels before copying attribute-ready exports into `project/assets`; no sibling Impower checkout is required. Legacy-named exports still require the separate portrait migration. The watcher processes changed exports; it does not rewrite already-current output files automatically.
- Inkscape's `inkscape:label` is normalized the same way. Save as "Inkscape SVG" to retain labels. An exporter that supplies only IDs needs an explicit `data-name` preparation step; IDs are never guessed into labels.

Normalization preserves IDs, SVG references, geometry, and existing names. It does not rename obsolete layer syntax in native source files; those names must be migrated separately. Loading prepares the asset without rewriting the original disk file; the optimizer writes normalized output files.

## Writing it in the script

After the portrait's name, add a colon and an option for each thing you want to set. A space ends a name inside `[[ ]]`, so the script writes a colon where a layer name writes a space; the conditions are otherwise spelled as in the layer names:

```
scene start
  [[mia:happy:hat:look.left]]
end
```

What you can write after `:`:

| You write | It does |
| --- | --- |
| `:happy` | Chooses `happy` in every group that has it. If only `face` has it, that is the face. If `face` and `eyebrows` both have a `happy`, both are set, which is usually what you want for an expression. |
| `:face.happy` | Chooses `happy` in the `face` group only. |
| `:hat` | Turns the `hat` switch on. |
| `:hat.off` | Turns it off, if a named look had turned it on. |
| `:eyes.closed` | Chooses `closed` in the `eyes` group. |

If a bare word is an option in two groups where choosing both would be a mistake, for example `down` in both `look` and `head`, the editor asks you to write `look.down` or `head.down` instead.

The editor's autocomplete, after you type `:`, lists only the options this portrait actually has. A portrait with no `hat` layer does not offer `hat`.

## Choosing an expression

The quickest way to choose between expressions is to look at them in the scene. With the Game Preview open and stopped, type the portrait's name and a colon, then move through the suggestions with the arrow keys: the preview shows the scene with each highlighted option in place, full size, with the character's other options and the order you wrote them in kept as they are. Highlighting `sad` while completing `[[mia:hat:|]]` shows exactly what `[[mia:hat:sad]]` would show.

Press Enter to keep the option you are looking at, or Escape to leave the line as it was; the preview returns to your script either way. The same works inside a named look's `attributes` list: the scene that uses the look shows each suggestion. [Previewing Suggestions](./SuggestionPreview.md) describes what the preview shows and when.

## Named looks

When you use the same combination often, give it a name:

```
define mia_party as filtered_image with
  image = image.mia
  attributes = { "happy", "hat", "look.left" }
end
```

`image.mia` refers to the image asset named `mia`. The attributes are written in quotes because a bare `look.left` would be read as a table lookup inside a define. Then `[[mia_party]]` is the same as `[[mia:happy:hat:look.left]]`, and you can still adjust it: `[[mia_party:sad]]` keeps the hat and the look and changes the face, because the later choice in the `face` group wins.

## Several pictures of one character

A name may hold `@` after its first character. The part before the first `@` says whose picture it is, and the part after it says which picture: an image file named `mia@night.svg` is the image `mia@night`, a picture of `mia`.

```
define mia@party as filtered_image with
  image = image.mia@night
  attributes = { "happy", "hat" }
end

scene start
  [[mia@night]]
  [[mia@night:happy]]
  [[mia@night:hat]]
  [[mia@party]]
  [[office + mia@night:happy]]
end
```

The rule is the same for every name Sparkdown reads: an image, a named look, a define, a variable or function in code, and each name in a directive. A name does not begin or end with `@`, and two `@` never sit together, so `@mia`, `mia@` and `mia@@night` are not names. An `@` joins a name as `_` does, even next to a word Luau reserves: `end@night` and `mia@end` are names, as `end_night` and `mia_end` are. The forms that begin with `@` keep their meaning: a style's state rule (`@hovered { … }`), an event (`@click`), a regular expression (`@/a+/`) and a function attribute (`@native`). An `@` followed by `/` is never part of a name.

A file can still be named that way. A file whose name begins or ends with `@`, such as `@night.png` or `night@.png`, is one ordinary picture named by its whole file name up to its first dot: `@night` and `night@`. It has no alternate and no layers. It shows on the Assets page under that name, but no script line can name it: `[[@night]]` is a syntax error. Rename the file to show it: `mia@night.png` for a picture of `mia`, or `mia night.png` for a layer `night` of `mia`. A file whose name is a picture and a stacking number with nothing after it, such as `ava 2.png`, is a layer of `ava` with no name. The compiler warns on each such file: it says the layer has no name after its stacking number and shows how to name it, as in `ava blush.png`.

## Backgrounds and props

Nothing in this chapter is only about characters. A background whose props change over the story is the same kind of image: a stack of layers, some of which show only in some states. A door that opens, a vase that breaks, a light that goes out, a note that appears on a table, are each a group with its options, drawn once in the same file as the room.

```
door.open
door.closed default
vase.broken
vase.whole default
lamp.off
lamp.on default
room
```

```
scene start
  [[office]]                          closed door, whole vase, lamp on
  [[office:door.open]]                the door opens
  [[office:door.open:vase.broken]]    and the vase breaks
  [[office:lamp.off]]                 the lamp goes out
end
```

Write the group with the option here, `door.open`, rather than a bare `open`, because a room often has several things that can be open or broken, and a bare word would set all of them.

The same room as image files follows the rules in the next section: `90 room.webp`, `20 door.closed default.webp`, `20 door.open.webp`, `10 vase.whole default.webp`, `10 vase.broken.webp`. A project that already keeps a base image and one file per prop, named on the pattern `bg_office__prop_door_open.webp`, is one rename away from this.

## Portraits made of image files

Everything above works the same when the layers are separate image files (PNG, WebP) instead of layers in one SVG. Put the files in a folder named after the portrait and name each file the way you would name a layer, starting with a number and a space. The number is the stacking order, lowest on top. Give layers different numbers when their relative order matters; equal numbers are ordered by file name. A file in the folder whose name does not start with digits and a space is not one of its layers: `90_body.png` is the plain image `90_body`.

```
assets/mia/
  90 body.png
  80 hair-back.png
  70 head.png
  60 face.neutral default.png
  60 face.happy.png
  50 whites eyes.open default.png
  40 pupils-camera eyes.open look.camera default.png
  40 pupils-left eyes.open look.left.png
  40 lids eyes.closed.png
  20 hair-top hat.off.png
  20 hair-under-brim hat.on.png
  10 hat.on.png
```

`[[mia:happy:hat:look.left]]` then means exactly what it means for the SVG version.

### Layer folders

A folder inside a portrait folder is a layer when its name starts with a number and a space, exactly like a file. Its files are its layers, the way [layers inside layers](#layers-inside-layers) work in an SVG. Give each face its own eyes by putting them in the face's folder:

```
assets/mia/
  90 body.png
  60 face.happy/
    40 pupils eyes.open default.png
    40 lids eyes.closed.png
    30 mouth.png
  60 face.neutral default/
    40 pupils eyes.open look.camera default.png
    40 pupils eyes.open look.left.png
    40 lids eyes.closed.png
    30 mouth.png
  20 hair-top hat.off.png
  10 hat.on.png
```

```
scene start
  [[mia]]
  [[mia:happy]]
  [[mia:happy:eyes.closed]]
  [[mia:look.left]]
end
```

- `[[mia]]` shows the body, the neutral face with its pupils looking at the camera and its mouth, and the hair-top, since the hat is off.
- `[[mia:happy]]` shows the body, the happy face's open pupils and its mouth, and the hair-top, and none of the neutral face's files.
- `[[mia:happy:eyes.closed]]` shows the body, the happy face's lids and its mouth, and the hair-top.
- `[[mia:look.left]]` shows the body, the neutral face's pupils looking left and its mouth, and the hair-top.

The rules:

- After its number, a layer folder's name is read like any layer name: an optional name, conditions and an optional `default`.
- A file or folder inside a layer folder shows only while that folder shows, and does not repeat the folder's conditions. Folders inside layer folders follow the same rules, to any depth.
- A `default` belongs to the folder it is written in, so each face rests its own eyes its own way. Two resting options for one group inside one folder still produce a warning.
- A folder stacks as a unit. Its number places the whole folder among its siblings, and the numbers inside it order only its own files, lowest on top. A folder numbered 60 with files numbered 10 and 90 sits whole between a sibling numbered 70 and a sibling numbered 50.
- A layer folder with no image files in it adds nothing.
- A folder whose name does not start with a number and a space is not a layer of the portrait folder around it: it stays a portrait of its own, and its layer files get a warning saying to number it.
- A numbered folder directly in `assets` sits in no portrait folder, so it is neither a layer nor a portrait, and its layer files get a warning.

Folders beside a picture are not read this way: `ava face.happy/` next to `ava.png` stays an ordinary folder.

An explicit `layered_image` definition with the same name overrides the folder convention.

Portrait names are shared by the whole project: two folders named `mia` anywhere in one project, or a folder named `mia` beside `mia.png`, produce a name-collision warning. A sub-project (a subfolder with its own `main.sd`) has names of its own, in a folder layout such as VS Code's; the web editor's layout migration currently moves a sub-project's assets out of its folder ([Scripts and projects](./Structure.md#28-scripts-and-projects)). Rename one to make each image addressable. A file such as `01_intro.png` is not a layer, so `[[01_intro]]` names it. Repeated filenames such as `90 body.png` in different portrait folders are private layers; refer to their portrait instead.

Export naming differs between programs and export commands. The numbered names above are the input convention. Some export commands replace each space with a hyphen, which turns `20 hair-top hat.off.png` into `20 hair-top-hat.off.png`: a valid name that means something else, a switch called `hair-top-hat`, so nothing warns about it. Check the exported files and the exported SVG layer names, and rename them to this pattern when necessary. Measured export compatibility for Photoshop, Krita, and Clip Studio Paint is tracked in [the export compatibility follow-up](https://github.com/ImpowerGames/impower/issues/486).

## Layer files beside a picture

A picture's layers can also sit beside it as files in the same folder, with no portrait folder. A space in a file name adds a layer to the picture named before it:

```
ava.png                    the plain picture of ava
ava@night.png              another whole picture of ava, called night
ava face.happy.png         a layer on ava.png, shown when face is happy
ava face.sad.png           a layer on ava.png, shown when face is sad
ava@night face.happy.png   a layer on ava@night.png only
```

The part after the first space is a layer name, written the way the rest of this chapter writes one: `group.option`, several options as `group.a.b`, several conditions separated by spaces, a trailing `default`, or a plain word for a layer that always shows. Dots belong to the layer name; only the last dot starts the extension. A file with no space keeps its usual name, the text before its first dot, so `ava.v2.png` is still the image `ava`.

Every image file whose name holds a space is a layer. `night sky.png` is not a picture called `night sky`: it is a layer `sky` on the picture `night`, and it always shows.

A layer belongs to one picture. `ava face.sad.png` never shows on `ava@night`; give the night picture its own layers.

The picture's own file is always the bottom layer. The others stack in file-name order, the first at the bottom, unless they carry a stacking number: the first word after the picture's name, when it is made only of digits. The number means what it means in a portrait folder: the lowest number is on top. The number is never part of a reference. `ava 2.png` is layer 2 with no name, which the editor reports. A picture whose name is only digits cannot take layer files beside it, because a file such as `7 face.happy.png` in a portrait folder is layer 7 of that folder's portrait.

In file-name order a space sorts before letters, digits and hyphens: `ava hair hat.off.png` comes before `ava hair-back.png`, so it stacks below it.

```
assets/Images/Portraits/
  ava.png
  ava@night.png
  ava 20 face.happy.png
  ava 20 face.sad.png
  ava 30 mouth.closed default.png
  ava 30 mouth.open.png
  ava 10 hat.on.png
  ava@night face.happy.png
```

```
scene start
  [[ava]]                    ava.png, closed mouth
  [[ava:happy:hat]]          ava.png, closed mouth, happy face, hat on top
  [[ava@night:face.happy]]   ava@night.png with its own happy face
end
```

Number every layer of a picture or none of them. A picture that mixes the two gets a warning naming the unnumbered files, and those stack below the numbered ones.

What shows when the script chooses nothing:

| File | Shows for `[[ava]]` |
| --- | --- |
| `ava.png` | yes, always (the base) |
| `ava face.happy.png`, `ava face.sad.png` | no |
| `ava mouth.closed default.png` | yes, the `mouth` group's default |
| `ava mouth.open.png` | no |
| `ava hat.on.png` | no, a switch starts off |
| `ava blush.png` | yes, it names no group |

A group with no `default` layer shows none of its layers until the script picks one. Beside a picture that is not a mistake and raises no warning: the picture is already a complete look. A picture may also be all layers with no file of its own, such as `cy body.png` and `cy face.happy.png` with no `cy.png`.

A picture with layer files is still named `image.ava` in a define, so a named look can start from it: `image = image.ava@night` with `attributes = { "face.happy" }`. The same holds for a portrait folder: `image.mia` names the folder's portrait. An explicit `layered_image` or `image` definition with the picture's name replaces the picture built from its files. Its own file stays `image.ava`, so a `layered_image` definition can list it: `assets = { image.ava, image.office }`.

`ava.png` beside a portrait folder `ava/` is one picture stacked two ways and gives a name-collision warning naming both. So do two files that are the same layer of one picture, such as `ava face.happy.png` and `ava face.happy.webp`. Two options of one group, `ava face.happy.png` and `ava face.sad.png`, are not a collision.

## When something looks wrong

Malformed layer names produce a warning and their own conditions are ignored; their parent conditions still apply. Fix the name before relying on that layer's visibility. A typo does not automatically hide artwork.

The editor checks the portrait files and the script and reports these in the problems panel:

- A layer name that does not follow the rules, including one that holds a space character that is not an ordinary space.
- Two different options marked `default` in the same group in the same folder. Only one can be the default.
- A one-off option or group spelling close to a repeatedly used name, such as `eybrows.angry` beside `eyebrows.angry`. A unique expression alone is not treated as a typo.
- A visible folder with named options but no selected or inherited default. Those layers stay hidden until you mark a resting option or select one in the script.
- An image file missing its stacking-number prefix inside an otherwise numbered raster portrait folder or layer folder.
- A folder without a number holding layer files inside a portrait folder. It is not a layer of that portrait; start its name with a number and a space to make it one.
- A numbered folder directly in `assets`. It is in no portrait folder, so it is neither a layer nor a portrait; move it into the portrait folder it belongs to.
- A picture whose layer files beside it mix numbered and unnumbered names.
- A script line that asks for an option the portrait does not have anywhere, such as `[[mia:gloves]]` when no layer in Mia's file mentions `gloves`. The option is ignored and the rest of the line still works.
- A script line that asks for an option one part of the portrait lacks, such as `[[mia:happy:look.left]]` when the happy face has no left-looking pupils. That part shows nothing for the group, the same as if the layer were missing, and the warning names the folder so the artist can add it.
- A direction selected while the face's eyes rest closed. Add `eyes.open` when you intend to open them, for example `[[mia:eyes.open:look.left]]`.
- A bare option that exists in two groups where setting both is unlikely to be intended.

If a portrait shows nothing for a part you expected, the usual reason is a group of named options with no `default` marked in that folder: nothing from that group shows until the script picks one.

Artwork warnings appear on the asset file, including art the script has not used yet. A hierarchy identifier distinguishes repeated layer names. Warnings about a script's selection stay on the script and link back to the artwork.

## Upgrading an existing filter project

The old include/exclude `filter` definitions have been replaced by attributes. An old filter name does not become an attribute automatically. Migrate the art, named looks, and script calls together in a separate copy of the project.

| Old construct | New construct |
| --- | --- |
| A `filter` definition matching expression tags | Conditions such as `face.happy` on the artwork, with a resting `default` where needed |
| `filtered_image.filters = { happy }` | `filtered_image.attributes = { "happy" }`, using the options the image actually contains |
| A script suffix naming an include/exclude filter | An option, switch, or qualified attribute, for example `:happy`, `:hat`, or `:look.left` |
| Selection tags in SVG IDs | Layer names in `data-name`; IDs remain SVG reference targets |

Start with one portrait: compare its resting look, each option, and combinations such as outfit plus held prop. Then migrate named looks and check that appended attributes override the intended group. Regex include/exclude rules may need several explicit conditions; there is no general one-to-one rename.

Migrate the native artwork's layer names before re-exporting: export normalization copies names into `data-name` without translating the old filter grammar.

## Making a portrait move

A portrait can also move between its states on its own, such as blinking from `eyes.open` to `eyes.closed` and back. [Portrait Morphs](./PortraitMorphs.md) shows how to prepare the layers and declare the movement, and [Talking](./PortraitMorphs.md#talking) shows how to make a character's mouth move while they speak. A portrait made of image files blinks and talks by showing, hiding and fading whole layer files ([Portraits made of image files](./PortraitMorphs.md#portraits-made-of-image-files)). A still portrait may use any SVG styling, but a portrait that moves has to avoid style sheets and the styles and transforms listed in [Art the morph can read](./PortraitMorphs.md#art-the-morph-can-read), or it shows without the morph.

## Quick reference

Layer name, read as "show NAME when GROUP is OPTION":

```
name
name group.option
name group.option default
name group.option group.option
name group.option.option
```

Script:

```
scene start
  [[name]]
  [[name:option:option]]
  [[name:group.option]]
  [[name:switch]]
  [[name:switch.off]]
  [[name@picture]]
  [[name@picture:option]]
end
```

File name for a layer in a portrait folder, for a layer folder and a layer inside it, and for a layer beside a picture:

```
NN name group.option group.option.png
NN name group.option/NN name group.option.png
picture NN name group.option group.option.png
```
