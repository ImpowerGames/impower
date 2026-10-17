<!--
The PR report: once the cutover switch in .agents/repos.json is on, the public pull request body is one summary paragraph and its closing lines (.agents/templates/public/PULL_REQUEST_TEMPLATE.md), and everything else it used to carry goes here, as a comment on the pull request's review thread, the internal ticket (or the umbrella of several tickets). Post it when the pull request opens and again whenever its head changes, and read each one back by id. The latest report is the one that stands; earlier ones stay as the record of what each head carried.

Keep the first line and every heading, in this order; write "None" or "Not applicable" with a short reason under one that does not apply. Delete these comments before posting.
-->

PR report for ImpowerGames/impower#<pull request number> at head <full head SHA>.

## Motivation

<!-- Why the change is needed. For a bug fix, state what was going wrong and the cause, with file:line references at the base commit. When there is no issue, describe the need here. -->

## Changes

<!-- What changed, as a bulleted list grouped by package or area. Call out anything that changes behavior, a public API, the Sparkdown syntax, or a generated file. Mention alternatives you rejected where a reviewer could reasonably ask. -->

## Type of change

<!-- One line: bug fix, feature, refactor or cleanup, performance, documentation, build/tooling/CI, or breaking change. List more than one where it applies, e.g. "feature, documentation". A breaking change also needs its migration described under Changes. -->

Type:

## Testing and verification

<!-- How you know it works. List tests added or changed with their paths, and the commands run with their results. For a bug fix, confirm the new test fails without the fix. For anything visible, attach before and after screenshots of the running editor, extension, or player, embedded where you describe what each frame shows; `gh issue comment --attach` uploads them (see .agents/skills/references/publishing.md). For performance, give before and after numbers and how they were measured. For tooling or configuration, say what you ran to prove the change does what it claims. Give the state of each CI check on this head. -->

## Checklist

<!-- Fill in what you actually did after each label. Leave a label blank, or write "not applicable" with a reason, rather than describing something you didn't do. -->

Tests run:

Visual check:

Docs:

Body read back:

## Notes for reviewers

<!-- Trade-offs, known limitations, follow-up work with the ticket that tracks it, and where a careful reviewer should look first. -->
