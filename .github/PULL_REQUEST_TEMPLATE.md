<!--
Title: conventional commit form, `type(scope): summary`, with the issue number at the end when there is one. Types: feat, fix, perf, refactor, test, docs, chore, build, ci. Scope is the package or area (compiler, engine, web-editor, vscode, sparkle, github). Example: "fix(compiler): accumulate all matching filtered_layers (#302)".

Open as a draft until it is ready for review. Keep every heading; write "None" or "Not applicable" with a short reason under one that does not apply. Delete these comments before opening.
-->

## Summary

<!-- One to three sentences a reviewer could repeat to someone else: what this pull request does. -->

Closes #

<!-- Keep the line above, with the issue number filled in, whenever this pull request resolves an issue. GitHub closes the issue on merge only when a closing keyword and the number appear together in this body; a number in the title does nothing. For several issues, repeat the keyword: "Closes #12, closes #34". When there is no issue, replace the line with "No linked issue." -->

## Motivation

<!-- Why the change is needed. For a bug fix, state what was going wrong and the cause, with file:line references at the base commit. When there is no issue, describe the need here. -->

## Changes

<!-- What changed, as a bulleted list grouped by package or area. Call out anything that changes behavior, a public API, the Sparkdown syntax, or a generated file. Mention alternatives you rejected where a reviewer could reasonably ask. -->

## Type of change

<!-- One line: bug fix, feature, refactor or cleanup, performance, documentation, build/tooling/CI, or breaking change. List more than one where it applies, e.g. "feature, documentation". A breaking change also needs its migration described under Changes. -->

Type:

## Testing and verification

<!-- How you know it works. List tests added or changed with their paths, and the commands run with their results. For a bug fix, confirm the new test fails without the fix. For anything visible, attach before and after screenshots of the running editor, extension, or player. For performance, give before and after numbers and how they were measured. For tooling or configuration, say what you ran to prove the change does what it claims. -->

## Checklist

<!-- Keep each statement as written if it's true, or edit it to say what actually happened. -->

Tests pass locally for the packages this touches.

Visual changes were checked in the running app; screenshots above.

Documentation updated where behavior changed.

Body read back after opening.

## Notes for reviewers

<!-- Trade-offs, known limitations, follow-up work with the issue that tracks it, and where a careful reviewer should look first. -->
