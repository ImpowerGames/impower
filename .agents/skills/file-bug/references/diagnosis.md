# Reproduce and diagnose a bug

All commands run from the worktree root unless stated otherwise.

## 2. Build the reproduction

The technique here is adapted from Matt Pocock's diagnosing-bugs skill (github.com/mattpocock/skills, MIT): build a tight pass/fail signal first, then minimise. The repo has three seams that reach most bugs. Any report, from a person or from a reviewer subagent, is a claim to reproduce before filing; a reviewer's finding gets the same loop as a user's.

Host the repro where a harness already exists, and say in the ticket which one: a package that has tests takes a test, the editor takes a `.sd` script through the driver. Standing up a harness for a package that has none is resolve-issue's job, not this skill's; a repro for such a package is a script or a driver probe, and the ticket says the package has no test setup. Copy repro syntax from a passing fixture rather than from memory; a repro written from recalled syntax fails on the syntax and reads as the bug.

Compiler, parser, or engine bug (label `system: sparkdown`): write a vitest test that asserts the user's symptom. Invoke `/write-regression-test` (skill name `write-regression-test`) in reproduction-only mode for where the test lives, which neighbour's imports to copy, and the capped single-file command; parallel or uncapped vitest runs have hard-crashed machines here, and that skill's resource rule is the one to follow.

Editor, preview, or visual bug (labels `app: web-editor`, `system: sparkle-ui`): write the smallest `.sd` script that shows it and drive it through the running editor. Invoke `/drive-web-editor` (skill name `drive-web-editor`) before the first run: it owns the driver that boots both dev servers, loads the script or, for a bug that involves assets, a whole project through `--project <dir-or-zip>` (a project directory or an exported zip, read from wherever it lives, an absolute path outside the repository included), scrubs the preview to a line, and screenshots, and its refusals and report fields distinguish setup failures from the bug under test; its Gotchas cover the traps a driver command cannot absorb. Then look at the screenshot. A visual bug is confirmed by what the pixels show, never by DOM geometry, computed styles, or log counts. If you cannot see it, say so; do not describe a screenshot you did not look at.

VS Code extension bug (label `app: vscode-extension`): write the smallest `.sd` that shows it and drive it through the served workbench. Invoke `/drive-vscode-web` (skill name `drive-vscode-web`) before the first run: it owns the driver that serves the built extension through `vscode-test-web`, opens the file, reads its diagnostics and a hover, and screenshots, and its refusals and report fields distinguish setup failures from the bug under test; its Gotchas cover the traps a driver command cannot absorb. Then look at the screenshot. Where the behavior comes from the shared package underneath (`packages/sparkdown` or the language server), a test there is the smaller repro; say in the ticket which you did.

Performance bug: the symptom is a number. Measure it with a harness (a script that times the operation, or the driver with a probe) before and, if you have one, on a control case, and record how each figure was taken and on what. A perception ("feels slow") is a report, not a reproduction.

Non-deterministic bug: raise the rate rather than hunting for a clean repro. Loop the trigger, add stress, narrow timing, and report the rate you reached ("fails 40 of 100 runs").

Then minimise. Cut inputs, steps, and script lines one at a time, re-running after each cut, until every remaining element is load-bearing. A minimal repro is the ticket's Reproduction section and, unchanged, the fixer's regression test.

Confirm it is the user's bug. A loop that goes red on a nearby failure produces a ticket for the wrong defect. The captured symptom (error text, wrong output, timing) must match what was reported.

Keep the artifacts: the test file or `.sd` script, the exact command, its output, the screenshot. They go into the ticket using [publishing](publishing.md) and are then deleted from the worktree; the ticket, not the checkout, is where they live.

## 3. When you cannot reproduce it

Stop and report to the user. List what you tried, on which surface and build, and what you saw instead. Ask for the missing piece: the exact project, a screen recording with timestamps, a log, or access to the environment where it happens. Do not file a Bug that claims something happens when you could not make it happen.

If the user, told that, still wants a ticket now, file it with the Reproduction section stating plainly "Not reproduced" and what was tried, so the next reader knows the claim is unverified. That is their call, not yours to make silently.

## 4. Look for the cause, within a budget

With a red loop in hand, spend a bounded effort (an hour of work, not a day) on where the bug comes from. Read the code the loop exercises; form two or three hypotheses that make different predictions; probe the one the loop can distinguish fastest. The repo's tickets routinely carry this, naming the line and quoting it, and it is what makes resolve-issue's fast path possible.

When the symptom is wrong output, read the compiled artifact before attributing the cause to a stage. A probe that shows correct output clears only what runs before the probe, not the rest of that stage and not the stage after it, so a fault in a later step of the same component looks like a fault downstream. `JSON.stringify(ctx.compiledJson)` prints what the compiler emitted, where `ctx` is what `makeRuntimeStoryFromSource` or `makeRuntimeStoryFromFile` in `packages/sparkdown/src/tests/runtime/runtimeTestHarness.ts` returns; a repro that runs through a driver gets the same artifact from a runtime test on the same source.

Report it honestly. "Confirmed" means the loop turned green when you changed that line and red when you changed it back, or the value you predicted appeared where you predicted it. Anything less is "suspected", and the ticket says which. Reference code as `file:line` at a specific commit, with a permalink, because code moves and tickets go stale.

Do not fix it. If the fix is obvious, put it under Analysis as a suggested fix; a ticket with a one-line fix still needs the regression test, the suite run, and the live verification that resolve-issue provides, and doing half of that here leaves a worse trail than doing none.
