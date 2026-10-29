# Previewing a Line

When you put the cursor on a line, the Game Preview runs your story from the top of the scene that line is in, with the starting values you set for that scene (every store at its first value when you set none), and shows what the game would show there. On the way it makes decisions no player sees: it takes an option at every menu, it can force an `if` the game would skip when your line is inside it, and it can leave a long loop before the game would. The route button and the route list show you each of these, so you can tell whether what is on screen is what a player would see.

## The route button

The preview's toolbar names the route it took: the scene it starts in, the scene's first line, and the line it ends at.

```
interrogation (4 → 21)
```

A route that starts in the content before any scene names the script instead (`main (1 → 21)`), and a route that ends in another script names that script (`interrogation (4 → chapter_2 : 12)`).

One icon before the name says how the route differs from play, the first that applies. When there is none, its place stays empty, so the name never moves:

- a detour arrow: the preview forced a branch the game would not take;
- scissors: the preview left a loop before the game would;
- a pin: your pins steered the route;
- no icon: the preview runs this line as the game does.

Hover over the button to read the route in words. Press it, or press Enter while it has focus, to open the route panel; press it again, or press Escape, to close it. While the game plays, the toolbar shows the line that is running instead.

When no route reaches your line, the button turns the error colour and shows a warning triangle, and the list says why.

## The route list

The route panel opens below the toolbar, inside the preview, and the game shrinks to make room. It has two tabs, "Route to line 21" and "Starting values" (described below), and opens on the one you used last. The route tab lists, in the order the route took them:

- one entry for each menu the route met, each `if` it forced and each loop it left early;
- Target line, the line you are previewing.

The route button already names where the route starts.

Each entry starts with its line number. Press the number to move the cursor to that line.

Above the entries, four toggles show or hide each kind of entry, with how many of each the route has. All four are on to begin with, and the preview remembers your choice. When the toggles hide any entries, the foot of the list says how many ("2 hidden by the toggles").

When the route made no decisions at all, the list says "The preview runs this line as the game does".

## The four kinds

| Kind | Icon | Meaning |
| --- | --- | --- |
| Pinned | pin | Choices you pinned |
| Auto | options list | Choices the preview made where you have no pin |
| Forced | detour arrow | Conditions the preview forced to reach the target line; the game would not go this way |
| Clipped | scissors | Loops the preview left before the game would; the game runs them to the end |

A Pinned or Auto entry names the option the preview took: `Choice Tell the truth.`. When the route meets the same option more than once, as it does at a menu inside a loop, a later entry says which time it was offered: `Choice Ask about the key. · 2nd time`.

A Forced entry gives the condition as it is written on its line, and the verdict the preview forced: `Condition trust > 3 forced true`. The values after that line are the ones the forced branch gives, which no player reaches the same way.

A Clipped entry gives how many passes the loop ran before the preview left it: `Loop clipped after 12,480 passes`. The values after the loop are the ones those passes left, which can differ from the game's: in the game the loop runs every pass. A loop is clipped however the preview left it, whether its own test was forced or a forced branch inside it broke out.

## Pins

Where you have no pin, the preview chooses an option that reaches your line. To decide yourself, pin the option you want it to take.

Press a choice entry's text to open its pin control. It says what the preview did at that menu, lists the options the menu offered there in the order the script lists them, marks the one taken, and gives each a Pin button. Press Pin to pin that option; its button then reads Pinned, and pressing it again unpins it. Unpin removes the pin at that menu. Pinning an option at a menu removes any other pin at that menu, so each menu has one pin at most. That includes a pin on an option the menu did not offer there, such as a gated option whose condition the route left false: the list does not show it, but Unpin removes it and pinning another option replaces it.

A pin names an option's line and which time the route is offered that option: the first time, the second time, and so on. So a menu inside a loop, such as a hub you come back to, can be pinned meeting by meeting: ask about the key the first time, the letter the second, then leave. A pin stays on its line as you edit, the way a breakpoint does: lines added or removed above it move it with its line, and deleting the option's line deletes its pin. Pins are kept for you in this project and are never written into the project's files. Clear pins, at the foot of the list, removes every pin in the project.

At a pinned menu the preview takes your pinned option wherever your line can be reached through it, even when that means forcing an `if` the game would skip; each forced condition is listed. A pinned option written with a condition (`* if key [Show the key.]`) is offered by forcing its condition, which is listed too. A pin says which option to take at a menu, never to avoid the menu: the preview does not force a condition just to keep a route away from your pinned menu. The preview takes another option only when your line cannot be reached through the pin, and then the route is the one it would take without the pin, and the entry says so: "Previewing line 11, which can't be reached through your pin, so the preview took another option here. The pin still holds for other lines." Pins apply to every route the preview plans: the one to the line you are previewing, the one Play starts from, and the one a suggestion's preview takes. Playing the game changes no pin.

A pin has these limits:

- An option without `+` can be taken once. When the route has already taken it, a later menu cannot offer it again, so a pin on that later offer is not followed.
- When an edit leaves two pins on one menu, the preview takes the option the menu lists first, and the other pin is not followed: its condition is not forced to offer it.
- The preview searches the routes that keep your pins first, for a limited share of its work. A pin whose routes take more work than that to reach your line, such as one that runs a long loop on every route, is not followed, as if the line could not be reached through it.
- When a menu offers only options a thread (`<- name`) adds, a pin on one of the menu's own options that it did not offer, such as a gated option whose condition the route left false, is not shown at that menu: the entry does not say it was not followed, and Unpin and Pin there leave it. Remove it from a route that offers one of the menu's own options, or with Clear pins.
- A pin follows its line through edits made in this editor. An edit made elsewhere can leave a pin on another line. A pin whose line holds no option is ignored, and the list shows it with Remove.

## Starting values

A scene the story reaches late is seldom in its first state when a player gets there: an earlier scene raised a store, the scene has been visited before, or the divert that entered it passed its parameters. The Starting values tab tells the preview what the scene starts with. Each scene has its own starting values, and the content before any scene has one more set. They are kept for you in this project, and are never written into the project's files.

The tab lists what the scene of the line you are previewing can take, in four groups:

- Parameters: each parameter of the scene. An unset parameter reads nil, which the tab marks with a warning.
- Stores: every `store`, and each `store` field of a `define` by its dotted name (`define guide with store mood = 1` gives `guide.mood`). A table store lists its fields under it, and a field set on its own applies over the store's first value. A `const` cannot be set.
- Visits, the counts before the scene starts: each scene, branch and label; each once-only option, by its text and line, with how many times it was taken; and each alternator, by its first alternative and line. Entering the scene adds one to its own count, as it does in a run, and a place given a count above zero reads as visited on the turn before the scene starts.
- Randomization: the seed. When it is unset, the preview and Play from a line use the seed 0, so a line shows the same random results every time. A Play from the content before any scene starts the story itself and draws its seed as the game does, unless that content's own seed is set. Setting the seed also resets the last draw, as `math.randomseed` does.

Each row shows the value its name starts with in grey. Type a value and press Enter, or leave the field, to set it; × clears it, and Reset all clears every value of the scene. A set row has a bar in its margin, the tab counts the values set, and the line at its foot says how many of the scene's values are set. The search field narrows the list.

A value is a literal: a number, a string, `true`, `false`, `nil` or a table, such as `{ name = "Ana", hp = 10 }`, with no expressions. A visit count or a seed is a whole number.

- A value that is not one yet shows an error badge, and is not kept until it is one.
- A value of another type than the store's shows a warning badge and still applies: a warning never stops a story from running. A store's type is its annotation when it has one (`store hp: number`, with `string?` also taking `nil`), and otherwise the type of its first value. An annotation that is not one type, such as `number | string`, takes any value.
- A value whose name, or whose option's or alternator's line, is no longer in the script is listed under "No longer in the script" with a warning badge. The preview ignores it, and × removes it. A value does not follow a rename.
- A change the editor could not keep goes back to the value before it, with an error badge that says so.

Hover over a badge, or move to it with the keyboard, to read its message. The tab's own icon is the warning or the error icon while any field shows one.

An option's or an alternator's value is kept on its line, and follows the line as you insert or delete lines above it. Deleting the line leaves the value under "No longer in the script".

Starting values apply wherever a route starts at the top of the scene: the preview, Play from a line, which starts from the preview's route, and the suggestion preview. A Play that started in an earlier scene carries its own values into later scenes, and applies none.

While none of a scene's parameters is set, a line in a scene that takes parameters is still reached from the story's start, through the divert that enters the scene with its arguments; setting any of its parameters starts the route at the top of the scene with the values you set.

## An example

```sparkdown
store trust = 0
store clues = 0

scene interrogation
  INSPECTOR:
    Where were you at nine?
  choose
    * [Tell the truth.]
      trust += 2
    * [Show the photograph.]
      trust += 5
    * [Lie.]
      trust -= 1
  end
  if trust > 3 then
    INSPECTOR:
      I believe you.
    for i = 1, 40000 do
      clues += 1
    end
    You found {clues} clues.
  end
end
```

With the cursor on line 21, the button reads `interrogation (4 → 21)` with the detour arrow. The list shows the option the preview chose at line 8 as Auto, the condition on line 15 as Forced, the loop on line 18 as Clipped, and Target line 21. The preview shows fewer clues than the game would, because it left the loop early.

With "Tell the truth." pinned, the preview takes it at line 8 and forces `trust > 3` true to reach line 21, so the list reads Pinned 8, Forced 15, Clipped 18. With "Lie." pinned, line 11 cannot be reached through the pin, since it is inside "Show the photograph.", so the preview takes that option and its entry says the pin was not followed.
