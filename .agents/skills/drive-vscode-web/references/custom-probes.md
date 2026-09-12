# Custom workbench probes

All commands run from the worktree root unless stated otherwise.

## Gotchas

This list holds only what the driver cannot absorb, because it belongs to a script of your own rather than to a driver command. Anything a mechanism can take is a refusal, a report field or a repair the driver makes, and the driver's own messages carry the fix for the failure they name.

- Monaco draws every space in a `.view-line` as U+00A0, so `textContent.includes("show backdrop")` never matches the source's spaces. The driver normalizes both sides; a probe of your own has to as well.
- Headless, a hover never opens under the mouse however carefully the pointer is moved, and Quick Open (Ctrl+P) is unreliable. The driver clicks the file's explorer row and opens the hover with Ctrl+K Ctrl+I, the Show Hover command, which works every time; a script of your own wants the same two.

---
