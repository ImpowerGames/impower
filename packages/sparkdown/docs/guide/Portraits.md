# Character portraits


A character in a visual novel needs many looks: happy, sad, eyes closed, wearing a coat, holding a phone. Drawing every combination as its own picture does not scale. Three outfits, four expressions and two eye directions are already twenty-four pictures, and adding one hat doubles that.

Sparkdown takes a different approach. You draw the character once as a stack of layers, name each layer so that it says when it should be visible, and the script turns layers on and off by name. One file, any combination.

This chapter shows how to name layers and how to ask for a look from the script. The examples use a character called Mia, and the same rules serve a background whose props change, which the chapter comes to near the end.

## The idea

Every layer has a name. A plain name like `body` or `hair-back` means the layer always shows.

To make a layer conditional, add a colon and the condition. The colon means "when", and inside the condition a dot means "is":

```
hair-top:hat.off        show hair-top when hat is off
hair-under-brim:hat.on  show hair-under-brim when hat is on
```

When the script asks for `[[mia:hat]]`, Sparkdown goes through the layers, keeps every layer whose condition is met, hides every layer whose condition is not met, and shows the result. That is the whole system. The rest of this chapter is the naming rules and what the script can ask for.

## A first portrait: a hat, and the hair around it

Mia sometimes wears a hat. A hat changes the hair, so the hair is drawn in three pieces: the hair at the back of the head, which shows either way; the hair pressed flat under the brim, which only makes sense with the hat; and the fluffy top of the hair, which the hat would cover. In the drawing program the layers are named like this, top layer first:

```
hat.on
hair-under-brim:hat.on
hair-top:hat.off
hair-back
head
body
```

Reading them one at a time:

- `body`, `head` and `hair-back` are plain names, so they always show.
- `hat.on` is the hat itself: show it when `hat` is `on`. A layer can be named by its condition alone, with nothing before a colon.
- `hair-under-brim:hat.on` is the flattened hair: show it when `hat` is `on`.
- `hair-top:hat.off` is the fluffy top: show it when `hat` is `off`.

A switch is off unless the script turns it on, so nothing has to say which state is the resting one.

In the script:

```
[[mia]]
```

shows Mia bare-headed. Nothing mentioned the hat, so it is off. The hair top shows; the hat and the flattened hair do not.

```
[[mia:hat]]
```

turns the hat on. The hat and the flattened hair show, and the hair top hides. Writing a switch's name after `:` turns it on.

This is how any "this part hides when that part shows" relationship works. There is no separate rule to write anywhere else; each layer says when it belongs.

## A choice between several options

Mia has three expressions. Only one can show at a time, so they form a group. A group is a word, the options are the words after the dot:

```
face.sad
face.happy
face.neutral:default
head
body
```

`face` is the group; `sad`, `happy` and `neutral` are its options. `:default` at the end of `face.neutral:default` marks the option that shows when the script does not choose one; read it as "face is neutral, by default". This is the one place the word is needed: a switch rests at `off` on its own, but among three named faces nothing says which one is the resting face unless you mark it.

A switch like `hat` is just a group whose two options are `on` and `off`, with `off` as its built-in default. An explicit `:default` can give it a different resting state, as the office lamp example below does.

```
[[mia]]          neutral face
[[mia:happy]]    happy face
[[mia:sad]]      sad face
```

You do not have to say which group `happy` belongs to. Sparkdown looks through the file, finds `happy` in the `face` group, and chooses it there. If you prefer to be explicit, `[[mia:face.happy]]` means the same thing: the condition is spelled in the script exactly as it is spelled in the layer name. `[[mia:hat]]` is short for `[[mia:hat.on]]`.

## Combining

Conditions from different groups combine freely:

```
[[mia:happy:hat]]
[[mia:sad:hat]]
```

The order after `:` does not matter, except in one case: if you name two options from the same group, the later one wins.

```
[[mia:happy:sad]]    sad face
```

That rule matters when you give a combination a name of its own and then adjust it, which the section on named looks covers.

## Layers inside layers

Expressions are usually more than one layer: skin, mouth, eyes. Put them inside the expression's layer, as a group or folder in the drawing program:

```
face.happy
    mouth
    eyes
    skin
face.neutral:default
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
face.neutral:default
    lids:eyes.closed
    pupils:eyes.open:look.left
    pupils:eyes.open:look.right
    pupils:eyes.open:look.camera:default
    whites:eyes.open:default
    mouth
    skin
```

Two new things are happening.

`pupils:eyes.open:look.left` has two conditions, each after its own colon. Read the colons as "when ... and when ...": show these pupils when eyes is open and look is left. Both have to hold.

`:default` at the end of a name marks the layer as part of the resting look, the one you get when the script chooses nothing. Every group named on that layer rests on the option the layer names. `whites:eyes.open:default` says eyes rest open. `pupils:eyes.open:look.camera:default` says eyes rest open and the look rests at the camera. Mark every layer that belongs to the resting look, the way you would leave them visible in the drawing program.

What the script gets:

```
[[mia]]              eyes open, looking at the camera
[[mia:look.left]]    eyes open, looking left
[[mia:eyes.closed]]  lids only; the whites and every pupils layer hide, because they all need eyes open
```

Notice that `[[mia:look.left]]` did not have to mention the eyes. The `eyes` group fell back to its default, open, on its own.

Each face carries its own eyes, so each face can have its own default look. If the happy face's pupils are marked `pupils:eyes.open:look.up:default`, then `[[mia:happy]]` looks up and `[[mia]]` looks at the camera. The happy face's eye layers can have exactly the same names as the neutral face's; nothing needs a distinguishing word.

## The naming rules

A layer name is the layer's own name, then optionally a colon and one or more conditions, and optionally `:default` at the end. When the condition alone is enough to describe the layer, the name before the colon can be left out. A tilde is accepted wherever a colon is, `hair-top~hat.off`, and means the same thing; the colon is the one the editor inserts.

| You write | It means |
| --- | --- |
| `body` | Always visible. A plain name. |
| `hat.on` | Show this layer when the `hat` switch is `on`. A layer can be named by its condition alone. |
| `hair-top:hat.off` | Show `hair-top` when `hat` is `off`. A switch is off unless the script turns it on. |
| `face.happy` | Show this layer when `face` is `happy`. `face` is a group; `happy` is one of its options. |
| `face.neutral:default` | The same, and `neutral` is the face that shows when the script chooses none. Only a group with named options needs this. |
| `pupils:eyes.open:look.left` | Show `pupils` when `eyes` is `open` and `look` is `left`. Every condition must hold. |

Rules to keep in mind:

- Use hyphens inside words: `hair-under-brim`, `pupils:look.far-right`. Do not use spaces or other punctuation; drawing programs replace them with hyphens on export, which is fine in a name and wrong in a condition.
- The descriptive name before a condition cannot contain a dot, because a dot always means "is".
- End every layer that belongs to the resting look with `:default`. Within one folder, the resting layers of a group must all name the same option; if they name two, the editor reports it. If a group of named options has no resting layer in a folder, nothing from it shows there until the script chooses. A switch, a group whose options are `on` and `off`, needs no marker: it is off until turned on.
- A layer may list several options of one group after the dot, `hand-right:arms.down.phone-left`, and then shows for any of them: the right hand is down when the arms are down and also when the phone is in the left hand. Read the extra dots as "or". If this layer ends in `:default`, the first option is its resting option. Conditions from different groups still all have to hold.
- An option with a hyphen in it is a kind of the word before the hyphen: `arms.phone` on a layer also matches `phone-left` and `phone-right`, so one layer can serve every way of holding the phone, while `arms.phone-left` matches only that one.
- A layer inside a conditional layer inherits the condition and does not need to repeat it.
- Layers may share a name. Give every mouth `mouth` and every set of open eyes `whites:eyes.open:default` if that is what they are.
- Layer names are checked when the file is loaded into the project. A name that does not follow the rules is reported in the editor's problems panel with the layer name, so a slip never silently changes what a layer means.

## Group, option, or switch?

Deciding which is which comes down to one test: what question does the layer answer about the character, and how many answers can be true at once?

- If the question has exactly one answer at a time, it is a group, and the answers are its options. "Which face?" is a group called `face`. "What are the arms doing?" is a group called `arms` with options `down`, `phone`, `phone-left`, `script`. "Which outfit?" is `clothes`. Name the group after the part or the slot, and the option after the answer. Choosing one option hides the others, which is exactly what you want for things that cannot both be true.
- If the question is yes or no, it is a switch: a group whose only options are `on` and `off`. "Is the hat on?" is `hat`. Gloves, mask, bandage, helmet are switches too. A switch is right for anything that can be added without changing the rest.
- If one thing can only be true while another is, it is a condition, not a new group. The flattened hair is not a kind of hair, it is hair that shows when the hat is on: `hair-under-brim:hat.on`.

The three punctuation marks follow from that:

- A dot joins a question to its answer: `arms.phone-left`. A second dot lists another answer that also shows the layer: `arms.down.phone-left`.
- A colon means "when": it separates the layer's name from its conditions, and one condition from the next. `hand-right:arms.down:clothes.coat` shows the hand when the arms are down and the outfit is the coat.
- A hyphen joins words inside one name or one option: `hair-under-brim`, `far-right`, `phone-left`. It also makes an option a kind of a broader one, so `phone-left` counts as `phone`.

So for a phone held in the left hand, the question is "what are the arms doing?", and the answer is "holding the phone, in the left hand": `arms.phone-left`. Not `hold-left.phone`, because `hold-left` is not a question about the character, and not `hold.phone-left`, because holding is not a part; the arms are.

## Drawing programs

Sparkdown reads portrait layer names only from `data-name`. SVG `id` values identify resources and references; they never select portrait attributes and do not need to match layer names.

- Affinity Designer preserves the typed name in `serif:id`. Importing or loading the SVG copies that label into `data-name` in the prepared asset. The engine then reads the normalized name. Existing `data-name` values take precedence.
- The portrait optimizer also performs this normalization before optimization. The screenplay project's `npm run portraits:watch` wrapper invokes that optimizer through its sibling Impower checkout, so newly optimized exports copied into `project/assets` already contain `data-name`. Update that checkout to this feature version to use the new step. The watcher processes changed exports; it does not rewrite already-current output files automatically.
- Inkscape's `inkscape:label` is normalized the same way. Save as "Inkscape SVG" to retain labels. An exporter that supplies only IDs needs an explicit `data-name` preparation step; IDs are never guessed into labels.

Normalization preserves IDs, SVG references, geometry, and existing names. It does not rename obsolete layer syntax in native source files; those names must be migrated separately. Loading prepares the asset without rewriting the original disk file; the optimizer writes normalized output files.

## Writing it in the script

After the portrait's name, add a colon and an option for each thing you want to set. The conditions are spelled exactly as in the layer names, colon and all:

```
[[mia:happy:hat:look.left]]
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

## Named looks

When you use the same combination often, give it a name:

```
define mia_party as filtered_image with
  image = image.mia
  attributes = { "happy", "hat", "look.left" }
end
```

`image.mia` refers to the image asset named `mia`. The attributes are written in quotes because a bare `look.left` would be read as a table lookup inside a define. Then `[[mia_party]]` is the same as `[[mia:happy:hat:look.left]]`, and you can still adjust it: `[[mia_party:sad]]` keeps the hat and the look and changes the face, because the later choice in the `face` group wins.

## Backgrounds and props

Nothing in this chapter is only about characters. A background whose props change over the story is the same kind of image: a stack of layers, some of which show only in some states. A door that opens, a vase that breaks, a light that goes out, a note that appears on a table, are each a group with its options, drawn once in the same file as the room.

```
door.open
door.closed:default
vase.broken
vase.whole:default
lamp.off
lamp.on:default
room
```

```
[[office]]                          closed door, whole vase, lamp on
[[office:door.open]]                the door opens
[[office:door.open:vase.broken]]    and the vase breaks
[[office:lamp.off]]                 the lamp goes out
```

Write the group with the option here, `door.open`, rather than a bare `open`, because a room often has several things that can be open or broken, and a bare word would set all of them.

The same room as image files follows the rules in the next section: `90_room.webp`, `20_door.closed~default.webp`, `20_door.open.webp`, `10_vase.whole~default.webp`, `10_vase.broken.webp`. A project that already keeps a base image and one file per prop, named on the pattern `bg_office__prop_door_open.webp`, is one rename away from this.

## Portraits made of image files

Everything above works the same when the layers are separate image files (PNG, WebP) instead of layers in one SVG. Put the files in a folder named after the portrait and name each file the way you would name a layer, with two differences:

- Start each file name with a number and an underscore. The number is the stacking order, lowest on top. Give layers different numbers when their relative order matters; equal numbers are ordered by file name.
- Use `~` in place of the colon, because a colon is not allowed in file names. A project that keeps its portraits as image files can use `~` in its script and in any SVG layer names too, so that every surface reads the same.

```
assets/mia/
  90_body.png
  80_hair-back.png
  70_head.png
  60_face.neutral~default.png
  60_face.happy.png
  50_whites~eyes.open~default.png
  40_pupils-camera~eyes.open~look.camera~default.png
  40_pupils-left~eyes.open~look.left.png
  40_lids~eyes.closed.png
  20_hair-top~hat.off.png
  20_hair-under-brim~hat.on.png
  10_hat.on.png
```

A folder has no "layers inside layers", so a file cannot inherit a condition from a parent. If the happy face needs its own eyes, name those files with the face condition as well: `40_happy-pupils-camera~face.happy~eyes.open~look.camera~default.png`. If one set of eyes fits every face, leave the face out and the same eye files serve all of them.

`[[mia:happy:hat:look.left]]` then means exactly what it means for the SVG version.

An explicit `layered_image` definition with the same name overrides the folder convention.

Portrait names are global: two folders named `mia`, or a folder named `mia` beside `mia.png`, produce a name-collision warning. Rename one to make each image addressable. Numbered files also retain their ordinary image name when that name is unique, so an existing `[[01_intro]]` still works. Repeated filenames such as `90_body.png` in different portrait folders are private layers; refer to their portrait instead.

Export naming differs between programs and export commands. The numbered names above are the input convention. Check the exported files and rename them to this pattern when necessary. Measured export compatibility for Photoshop, Krita, and Clip Studio Paint is tracked in [the export compatibility follow-up](https://github.com/ImpowerGames/impower/issues/486).

## When something looks wrong

Malformed layer names produce a warning and their own conditions are ignored; their parent conditions still apply. Fix the name before relying on that layer's visibility. A typo does not automatically hide artwork.

The editor checks the portrait files and the script and reports these in the problems panel:

- A layer name that does not follow the rules, or a name that mixes `:` and `~`.
- Two different options marked `default` in the same group in the same folder. Only one can be the default.
- A one-off option or group spelling close to a repeatedly used name, such as `eybrows.angry` beside `eyebrows.angry`. A unique expression alone is not treated as a typo.
- A visible folder with named options but no selected or inherited default. Those layers stay hidden until you mark a resting option or select one in the script.
- An image file missing its stacking-number prefix inside an otherwise numbered raster portrait folder.
- A script line that asks for an option the portrait does not have anywhere, such as `[[mia:gloves]]` when no layer in Mia's file mentions `gloves`. The option is ignored and the rest of the line still works.
- A script line that asks for an option one part of the portrait lacks, such as `[[mia:happy:look.left]]` when the happy face has no left-looking pupils. That part shows nothing for the group, the same as if the layer were missing, and the warning names the folder so the artist can add it.
- A direction selected while the face's eyes rest closed. Add `eyes.open` when you intend to open them, for example `[[mia:eyes.open:look.left]]`.
- A bare option that exists in two groups where setting both is unlikely to be intended.

If a portrait shows nothing for a part you expected, the usual reason is a group of named options with no `default` marked in that folder: nothing from that group shows until the script picks one.

Artwork warnings appear on the asset file, including art the script has not used yet. A hierarchy identifier distinguishes repeated layer names. Warnings about a script's selection stay on the script and link back to the artwork.

## Upgrading an existing filter project

The old include/exclude `filter` definitions have been replaced by attributes. Accepting `~` preserves the separator spelling only: an old filter name does not become an attribute automatically. Migrate the art, named looks, and script calls together in a separate copy of the project.

| Old construct | New construct |
| --- | --- |
| A `filter` definition matching expression tags | Conditions such as `face.happy` on the artwork, with a resting `:default` where needed |
| `filtered_image.filters = { happy }` | `filtered_image.attributes = { "happy" }`, using the options the image actually contains |
| A script suffix naming an include/exclude filter | An option, switch, or qualified attribute, for example `:happy`, `:hat`, or `:look.left` |
| Selection tags in SVG IDs | Layer names in `data-name`; IDs remain SVG reference targets |

Start with one portrait: compare its resting look, each option, and combinations such as outfit plus held prop. Then migrate named looks and check that appended attributes override the intended group. Regex include/exclude rules may need several explicit conditions; there is no general one-to-one rename.

The [Raffles and Bunny migration tooling](../../../../scripts/portrait-migration/README.md) handles that project's known legacy rules and verifies its expected visual differences. It is not a general converter for arbitrary projects. Migrate the native artwork's layer names before re-exporting: export normalization copies names into `data-name` without translating the old filter grammar.

## Quick reference

Layer name, read as "show NAME when GROUP is OPTION":

```
name
name:group.option
name:group.option:default
name:group.option:group.option
name:group.option.option
```

Script:

```
[[name]]
[[name:option:option]]
[[name:group.option]]
[[name:switch]]
[[name:switch.off]]
```

File name for an image-file portrait:

```
NN_name~group.option~group.option.png
```
