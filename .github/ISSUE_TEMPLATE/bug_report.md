---
name: Bug report
about: Something behaves wrongly, crashes, hangs, or regresses. Filed as issue type Bug.
title: ""
labels: ""
type: Bug
assignees: ""
---

<!--
Title: one sentence naming the wrong behavior and, when known, the mechanism in parentheses. Example: "First click in play mode freezes the game for seconds (Clock.syncToClock re-sync discards the time offset)". No prefix and no ticket number.

Labels: apply every area the bug touches. `system: sparkdown` (language, compiler, engine packages), `system: sparkle-ui` (Sparkle layout, components, styles, reactive engine, DOM renderer), `app: web-editor` (the impower-dev editor and web player), `app: vscode-extension` (vscode-sparkdown), `documentation`.

Keep every heading below, in this order. Write "Not yet known" under a heading rather than deleting it or guessing. Delete these comments before filing.
-->

## Symptom

<!-- What the author or player sees, in behavior terms. One paragraph. Quote the exact error text if there is one. -->

## Steps to reproduce

<!-- Numbered steps from a fresh state. Include the smallest Sparkdown script that triggers it in a fenced code block, or name the project and file it was observed in. Say which surface: web editor, VS Code extension, or the player. -->

1.

## Expected result

## Actual result

## Evidence

<!-- Measurements, logs, screenshots, or a test that demonstrates the problem. Give absolute numbers and say how each was taken: which harness, which build, which machine. A screenshot of the running editor counts; a description of what one would show does not. -->

## Root cause

<!-- Where the wrong behavior comes from, with file:line references at a specific commit (a permalink is best) and the relevant lines quoted. If this is only a suspicion, say so and list what was checked. -->

## Suggested fix

<!-- The change that would resolve it, plus any alternative considered and why it lost. Name anything that must stay true after the fix, such as a related feature that must keep working or a performance ceiling. -->

## Environment

<!-- Only when it matters: OS, browser or VS Code version, commit or extension version. Write "Platform independent" otherwise. -->

## Related

<!-- Issues and pull requests this depends on, duplicates, or was found by, for example "Found by adversarial review on #383". -->
