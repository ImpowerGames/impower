<!--
Title: conventional commit form, `type(scope): summary`, ending with the internal ticket in parentheses. Types: feat, fix, perf, refactor, test, docs, chore, build, ci. Scope is the package or area (compiler, engine, web-editor, vscode, sparkle, github). Example: "fix(compiler): accumulate all matching filtered_layers (I-302)". A pull request that closes several tickets names their umbrella.

Open as a draft until it is ready for review. This body is one summary paragraph and the closing lines, nothing else. The motivation, changes, type of change, testing and verification, checklist and notes for reviewers go in the PR report, a comment on the ticket in the internal tracker that follows .agents/templates/pr-report.md, and every review comment goes on that ticket too. Delete these comments before opening.
-->

<!-- One paragraph a reviewer could repeat to someone else: what this pull request does. -->

Closes ImpowerGames/impower-internal#

<!-- Keep the line above, with the ticket number filled in. GitHub closes the ticket on merge only when a closing keyword and the reference appear together in this body; the (I-N) in the title closes nothing, and a bare "#N" here names a pull request in this repository. When the change also resolves an issue filed in this repository, add "Closes #N" for it on its own line. A pull request that closes several tickets closes their umbrella and each of them: "Closes ImpowerGames/impower-internal#40, closes ImpowerGames/impower-internal#12, closes ImpowerGames/impower-internal#34". When there is no ticket, replace the line with "No linked issue." -->
