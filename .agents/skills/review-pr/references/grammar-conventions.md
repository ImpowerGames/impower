# Grammar-conventions lens

All commands run from the worktree root unless stated otherwise.

The coordinator assigns this lens to any PR whose diff touches `definitions/yaml/sparkdown.language-grammar.yaml` or anything under `packages/sparkdown/src/compiler/lower/`. It sets no reviewer floor: it is carried by one of the reviewers the sizing step chose, the undirected one when that is the only reviewer, never an extra process. Section numbers below refer to `packages/sparkdown/docs/compiler/GRAMMAR.md` in the worktree; read the sections a question cites before answering it.

The lints can require a justification comment; only a reviewer can judge whether the justification holds. This lens exists for those judgments. Answer each question below for every construct the diff adds or changes, cite the `file:line`, and report a violation of a rule the guide states as a requirement as `blocking`.

## Questions

1. Lowerer regexes and string scans. For every new regex, or `split`, `indexOf`, `startsWith`, `includes` or similar classify/split call on source text in a lowerer, with or without a `// value-level:` marker: does it decide what kind of node this is, or where one part ends and the next begins? That is a §5.1 violation and blocking; the grammar must make the distinction with a capture or rule. A call that only interprets a value the grammar already isolated whole is acceptable. Check that any marker comment states which of the two it is truthfully.
2. Lookarounds. For every added or kept `(?=…)`, `(?!…)` or `(?<…)` and its `# lookaround:` comment: name the rival rule it guards against, and check that the comment shows each structural alternative of §10 and §10.1 was tried or cannot work: reordering the `patterns:` list, splitting the Switch, letting the parent's `end:` carry the terminator, or tightening a variable. A comment that only restates what the lookaround matches is not a justification. When the PR description or the comment is phrased "only when", "except when", "unless inside" or "but not when it looks like", that is the §10.2 warning sign: ask the reframe question (which rule should claim this text first, and what order makes that true) and report the answer.
3. Guide requirements. Does the diff break a rule `GRAMMAR.md` states as a requirement? Cite the section. The lints in `packages/eslint-plugin-sparkdown-grammar` already check capture naming, `Scoped` bail-outs, whitespace classes, zero-width and newline lookaround patterns, tag-name symmetry and unreferenced rules, and the coordinator reads the head's workflows for `scopeEquality.test.ts` and `.vsc.snap` presence; spend no time on those.

## What this lens does not do

Run no test suite, CI check or formatter comparison; the undirected reviewer owns the red-on-base run and the reading of the head's workflows. Reading the guide and the diff answers every question above. Repository-rule checks that need no process, such as a generated `language/*.json` edited without its YAML source, still belong to you as to every reviewer.
