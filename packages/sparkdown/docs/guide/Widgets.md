# 5. Interactive Widgets

Some elements are **controls** the player operates: buttons, text fields,
sliders, checkboxes, dropdowns. They ship with default styling and behavior;
your job is wiring them to your state.

---

## 5.1 How binding works

Sparkle binding is **one-way** by design: a `#value` (or `#checked`) prop makes
the control **follow** your state. When the state changes, the control updates.

```sparkdown
field #value={player.name}     -- the field always shows player.name
```

To send the player's input **back** into your state, add an event handler that
reads the `event` payload. This keeps the flow explicit — data goes out through
`#value`, and comes back through `@input` / `@change`:

```sparkdown
field #value={player.name} @input={ player.name = event.value }
```

The `event` payload carries `event.value`, `event.checked`, and `event.key`,
depending on the control.

A widget's quoted content, when given, is its **label**: `slider "Master Volume"`
labels the slider.

---

## 5.2 Button & link

Text plus a `@click`:

```sparkdown
button "Save"  @click=save
link   "Back"  @click=go_back
```

Buttons ship with a filled, rounded default style and a hover state; links are
underlined. Restyle either with classes (`button primary`) or inline props.

---

## 5.3 Text field

`field` (or `input`) shows a value and writes it back on `@input`:

```sparkdown
field #value={hero_name} #placeholder="Name your hero" @input={ hero_name = event.value }
```

- `#value` — the current text (one-way).
- `#placeholder` — hint text shown when empty.
- `@input` — fires on each keystroke; `event.value` is the new text.

---

## 5.4 Slider

A range control. Bind `#value`, and set the range with `#min` / `#max`:

```sparkdown
slider #value={volume} #min=0 #max=100 @input={ volume = event.value }
```

- `event.value` is numeric, so your state stays a number.
- The filled portion of the track follows the value automatically.

---

## 5.5 Checkbox

A boolean toggle. Bind `#checked`, and write back on `@change`:

```sparkdown
checkbox #checked={music_muted} @change={ music_muted = event.checked }
```

`event.checked` is `true` / `false`.

---

## 5.6 Dropdown

A `dropdown` holds `option` children and binds the selected value. It writes
back on `@change`:

```sparkdown
dropdown #value={difficulty} @change={ difficulty = event.value }:
  option "Easy"   #value="easy"
  option "Normal" #value="normal"
  option "Hard"   #value="hard"
```

- Each `option` has text content and an optional `#value` (it defaults to the
  option's text).
- The dropdown selects whichever option matches the bound `#value`.

---

## 5.7 A settings panel, end to end

```sparkdown
store volume = 80
store music_muted = false
store difficulty = "normal"
function go_back()       end
function save_settings() end

layout settings with
  column menu #child-gap=16:
    text title "Settings"

    slider "Master Volume" #min=0 #max=100 #value={volume} @input={ volume = event.value }
    checkbox "Mute Music" #checked={music_muted} @change={ music_muted = event.checked }

    dropdown #value={difficulty} @change={ difficulty = event.value }:
      option "Easy"   #value="easy"
      option "Normal" #value="normal"
      option "Hard"   #value="hard"

    row #child-gap=16 #child-justify=space-between:
      button "Back"  @click=go_back
      button "Apply" @click=save_settings
end
```

Next up: [Screens & Navigation](./Screens.md) — moving between full-screen views.
