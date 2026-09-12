# Custom probe caveats

All commands run from the worktree root unless stated otherwise.

## Gotchas

This list holds only what no driver refusal, report field or check can absorb: a behaviour of the app the driver does not wrap, a fact about this machine, or a trap whose mechanism is a feature with its own ticket. Anything a mechanism can take belongs in the driver, whose own messages carry the fix for the failure they name.

- Scrubbing only works while the preview is stopped; after PLAY the engine is time-driven, ignores the cursor, and the scrub silently does nothing. The driver never presses PLAY, so this bites only a script of your own.
- The preview keeps the position the last run left it on, because the profile and the origin are both pinned and the editor restores the previous cursor, so a run that scrubs to a line the previous run already reached looks the same whether or not this run's scrub did anything. When you are testing the scrub itself rather than using it, aim at a line the previous run did not visit.
- `textContent` on the game DOM returns a wall of CSS, because the player injects `<style>` blocks that every ancestor inherits, and the typewriter effect wraps every character in its own `<span>`, so "leaf nodes with text" gives one letter per entry; a probe of your own wants `innerText`, which the driver uses.
- The editor auto-closes `[[`, so a script of your own that types `[[show portrait bunny]]` leaves a stray `]]` behind the caret and a trailing `>` lands mid-line, silently joining two beats; type the opener, press `End`, and read the document back with `documentLines`. The driver's `--sd` path writes the file directly and is unaffected.
- The route indicator lives inside the player iframe, so searching the editor document for `main : N → main : M` finds nothing; `verify` reads it for you and reports it as `route`.
- The command line cannot attach an image to a pull request. Describe what each frame shows under Testing and verification, keep the files in the private scratch directory, and attach them through the web form if a person wants them.
- A pid taken from `$!` in Git Bash is the MSYS pid, not the Windows pid a state file needs; get a child's pid from Node.
- A trailing slash on a scratch junction empties the directory it points at: `rm -rf <link>` removes the junction alone, but `rm -rf <link>/`, which Git Bash tab-completion adds, follows it into the real target. Remove a junction by its bare path, and before the scratch directory around it.

---

For asset measurements, also read [asset cache evidence](asset-cache.md) before probing.
