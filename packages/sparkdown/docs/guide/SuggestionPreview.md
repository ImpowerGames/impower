# Previewing suggestions

When the Game Preview is open and stopped, it shows what an autocomplete suggestion would do before you accept it. Highlight a suggestion and the preview shows the scene as it would look with that suggestion in place. Move to another suggestion and the preview follows. Close the list and the preview returns to your script as it is.

Nothing you only highlight is written anywhere. Your script, its undo history, the saved file, the error list and anything you export stay exactly as they were. Only accepting a suggestion changes the script, the same way it always does.

## How it works

Every suggestion is previewed the same way, whatever it completes: an expression, an image name, a value in a `define`, a style value, a variable, a keyword. The preview takes your script, applies the text the suggestion would insert, and runs the result exactly as it would run if you had typed it, from the start of the scene to the line you are on. So a suggestion that changes a definition your scene uses shows its effect in that scene, and a suggestion that changes nothing visible leaves the picture as it was.

The preview shows the scene your cursor is in, as it does while you type. It does not go looking for another scene that would show the suggestion better. If you are editing a definition in a script that has no story lines of its own, the preview keeps showing the scene it was showing, with the suggestion applied to it.

## What you see

While a suggestion is being prepared, the last picture stays on screen. If preparing takes a moment, the preview's toolbar says "Preparing suggestion preview…".

While a suggestion is on screen, the toolbar says "Previewing suggestion", so you can tell the picture is not your script yet.

If a suggestion cannot be previewed, for example because the script would not run with it, the last picture stays on screen and the toolbar says "Cannot preview this suggestion yet — showing the last valid preview". Highlighting another suggestion, or editing the script, tries again.

If you close the list while your script itself cannot be previewed, the last picture stays and the toolbar says "Cannot preview the current document — showing the last valid preview" until the script runs again.

## Closing and accepting

Pressing Escape, clicking away, or moving the cursor closes the list, and the preview goes straight back to your script.

Accepting a suggestion inserts it into the script as usual. The picture of that suggestion stays on screen until the script has been compiled with it, so the preview does not flicker back to how it was before.

## When it does not take part

Suggestions are previewed only while the Game Preview is open and stopped. A hidden or collapsed preview stays as it is, and the preview never opens itself. While the game is playing or paused, highlighting suggestions does not change it, and pressing Play always starts from your script as it is, never from a suggestion.

## How long it takes

A suggestion is compiled like any edit, so it takes about as long to appear as the preview takes to catch up after you type. On a small scene that is a fraction of a second; on a long script with many illustrated portraits it can be closer to a second. Holding an arrow key does not queue up work: only the suggestion you stop on is shown.

The small picture in the suggestion's documentation panel is still there, and is still the quickest way to see an image on its own.
