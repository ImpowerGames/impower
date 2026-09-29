# Author-experience lens

All commands run from the worktree root unless stated otherwise.

This lens measures what a writer's own live verification cannot: the experience of an author who does not already know how the feature works. The coordinator assigns it to any PR that adds or changes Sparkdown syntax, the language server's completions, hover or diagnostics, the user docs for either, or the editor's interface. It is one of the reviewer count chosen in the sizing step, never an extra process.

The lens exists to find one class of problem that reading the diff cannot: an input an author would plausibly type that the editor accepts silently, swallows into the wrong construct, or answers with a diagnostic that points at the wrong place or says nothing useful. Every attempt in the transcript should serve that search.

## Procedure for the reviewer

Do the task before reading the code. Your prompt states the change's goal for the people who use the product; from that statement, write down the goal as an author would phrase it (for example "make this character blink while idle" or "show this choice only once"), and what you expect to type to achieve it. Then attempt it in the running editor using only what an author has: the editor itself, the user docs under `docs/`, and the PR description. Read the diff only after the attempt is recorded; reading it first removes the confusion this lens exists to find.

Drive the editor through the drive-web-editor skill, from the worktree under review. Run `preflight`, `up`, then `ui` and `verify` with `--sd` scripts and `--shot` paths under your own subdirectory `REVDIR`. Use only the driver's built-in commands; a custom probe script would have to live inside the repo tree, and reviewers do not write there. The driver's own gitignored state file beside it is the one file it may create. Run `down` when finished, and only for the record you started.

Plan the transcript before the first attempt and keep it to eight attempts. Three of them are fixed: the syntax typed slightly wrong in the ways an author would, one attempt each for a missing keyword or terminator, the wrong separator or punctuation, and the old or a neighbouring spelling of the form. The other five cover the goal itself, discovery through completion or hover, and consistency with the syntax beside it. An attempt whose result you cannot read from the editor moves to a coverage gap; do not spend further attempts chasing it, and do not add controls for behaviour the change does not touch. Going past eight needs a reason written in the transcript, such as a wrong-input attempt that revealed a second construct worth one more probe.

Record every attempt, including the failed ones: the exact text typed, the completion list or hover shown, every diagnostic with its position and wording, the screenshot, and how the attempt was eventually resolved (docs, guessing, reading the diff). The number of attempts and where each went wrong is the primary measurement.

Run no test suite, CI check or formatter comparison. The undirected reviewer owns the red-on-base run of the new test files and the reading of the head's Test Suite and typecheck workflows, and the coordinator adjudicates their results. Your test-honesty duty is answered from the transcript: check that the new tests exercise the inputs you typed, including the wrong ones, and report as `blocking` a wrong input you observed that no test pins. A repository-rule check that needs no process, such as a generated grammar file edited without its YAML source, still belongs to you as to every reviewer.

## Short procedure for a rewording

When the change only rewords, repositions or adds a diagnostic for a construct whose syntax it leaves alone, the coordinator marks the lens `author-experience (short)` in the round state and in the prompt's lens field, and the transcript is three attempts: the construct written correctly, the mistake the diagnostic is for, and one neighbouring mistake it is not for. Everything else in this reference applies unchanged.

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

Stop your own driver servers before launching this reviewer; the driver pins one server pair per tree and records it beside itself, so a standing record of yours would be reused or replaced by the reviewer's `up`. Do not launch this reviewer in parallel with any other process that drives the same worktree. Supply the change's user-facing goal as the prompt builder's `task` field, taken from the issue when there is one and otherwise from the PR description, and repeat it in the round state comment, so the reviewer's task comes from what the change is for rather than from the diff. The reviewer may have no access to GitHub, so the goal must travel in the prompt.

Decide between the full and the short procedure from the diff before launching: a grammar, completion, hover, docs or editor-interface change takes the full procedure; a change confined to a diagnostic's wording, range or presence takes the short one. Because this reviewer runs no suite, do not assign it the test-honesty red-on-base run; that stays with the undirected reviewer in the same round.
