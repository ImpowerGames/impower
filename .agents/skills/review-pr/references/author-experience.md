# Author-experience lens

All commands run from the worktree root unless stated otherwise.

This lens measures what a writer's own live verification cannot: the experience of an author who does not already know how the feature works. The coordinator assigns it to any PR that adds or changes Sparkdown syntax, the language server's completions, hover or diagnostics, the user docs for either, or the editor's interface. It is one of the reviewer count chosen in the sizing step, never an extra process.

## Procedure for the reviewer

Do the task before reading the code. From the issue and the PR description, write down the goal as an author would phrase it (for example "make this character blink while idle" or "show this choice only once"), and what you expect to type to achieve it. Then attempt it in the running editor using only what an author has: the editor itself, the user docs under `docs/`, and the PR description. Read the diff only after the attempt is recorded; reading it first removes the confusion this lens exists to find.

Drive the editor through the drive-web-editor skill, from the worktree under review. Run `preflight`, `up`, then `ui` and `verify` with `--sd` scripts and `--shot` paths under your own subdirectory `REVDIR`. Use only the driver's built-in commands; a custom probe script would have to live inside the repo tree, and reviewers do not write there. The driver's own gitignored state file beside it is the one file it may create. Run `down` when finished, and only for the record you started.

Record every attempt, including the failed ones: the exact text typed, the completion list or hover shown, every diagnostic with its position and wording, the screenshot, and how the attempt was eventually resolved (docs, guessing, reading the diff). The number of attempts and where each went wrong is the primary measurement.

## What to probe

- Discoverability: can the feature be found from inside the editor, through completion or hover, without opening a doc?
- Mistakes: type the syntax slightly wrong in the ways an author would (a missing keyword, the wrong separator, the old spelling of a renamed form). Is there a diagnostic, is it on the right line, and does its wording say what to do?
- Consistency: does the new form read like the syntax beside it, or does it add a second way of saying something the language already says?
- Docs and description: does what the docs and the PR description say happen match what the editor does?
- Recovery: after a mistake, does the preview or the editor stay usable, or does the author lose their place, their text or their preview state?

## Reporting

An author-experience finding is a quality finding under the reviewer prompt's rules, and its evidence is the transcript: what was typed, what was shown (with the screenshot), what an author would expect, and the consequence. An impression without a transcript is not a finding.

Severity follows the prompt's three levels. A wrong input with no diagnostic, or with a misleading one, is `should-fix`. A feature that cannot be discovered from the editor is `should-fix`. A crash, lost text or a broken preview during the task is a defect at the normal bar and is `blocking`. Wording preferences are `optional`.

Put the attempt count and the transcript summary in the report's coverage section even when there are no findings, so the round records that an author actually performed the task.

## Coordinator duties

Stop your own driver servers before launching this reviewer; the driver pins one server pair per tree and records it beside itself, so a standing record of yours would be reused or replaced by the reviewer's `up`. Do not launch this reviewer in parallel with any other process that drives the same worktree. Include the issue's user-facing goal in the round state comment so the reviewer's task matches the ticket rather than the diff.
