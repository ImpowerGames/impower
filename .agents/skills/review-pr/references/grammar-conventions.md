# Grammar-conventions lens

All commands run from the worktree root unless stated otherwise.

The coordinator assigns this lens to any PR whose diff touches `definitions/yaml/sparkdown.language-grammar.yaml` or anything under `packages/sparkdown/src/compiler/lower/`. It is one of the reviewer count chosen in the sizing step, never an extra process. Section numbers below refer to `packages/sparkdown/docs/compiler/GRAMMAR.md` in the worktree; read the sections a question cites before answering it.

The lints can require a justification comment; only a reviewer can judge whether the justification holds. This lens exists for those judgments. Answer each question below for every construct the diff adds or changes, cite the `file:line`, and report a violation of a rule the guide states as a requirement as `blocking`.

## Questions

1. Lowerer regexes and string scans. For every new regex, or `split`, `indexOf`, `startsWith`, `includes` or similar classify/split call on source text in a lowerer, with or without a `// value-level:` marker: does it decide what kind of node this is, or where one part ends and the next begins? That is a §5.1 violation and blocking; the grammar must make the distinction with a capture or rule. A call that only interprets a value the grammar already isolated whole is acceptable. Check that any marker comment states which of the two it is truthfully.
2. Lookarounds. For every added or kept `(?=…)`, `(?!…)` or `(?<…)` and its `# lookaround:` comment: name the rival rule it guards against, and check that the comment shows each structural alternative of §10 and §10.1 was tried or cannot work: reordering the `patterns:` list, splitting the Switch, letting the parent's `end:` carry the terminator, or tightening a variable. A comment that only restates what the lookaround matches is not a justification. When the PR description or the comment is phrased "only when", "except when", "unless inside" or "but not when it looks like", that is the §10.2 warning sign: ask the reframe question (which rule should claim this text first, and what order makes that true) and report the answer.
3. Captures. One capture per meaningful sub-token, never several lumped into one (§6.3); anything the lowerer reads goes through a named wrapper rule, never an auto-generated `_cN` name (§6.4).
4. New `Scoped` rules. Bounded to the declaration line rather than the body unless §16.3 justifies the larger scope (§16); the `end:` carries the BEAT bail-out (§3.1); every line inside is fully tiled so the rule never closes `ERROR_INCOMPLETE` mid-line (§3.2, §17).
5. Whitespace. Each new whitespace match uses the class chosen by whether the formatter should normalise it (§12).
6. Luau context. A construct added in Luau context has its `Sparkdown`-prefixed twin, and both twins' `patterns:` lists include the new rule (§3.2, §13).
7. Fixtures and engine parity. New grammar fixtures carry a `.vsc.snap`, and the PR's verification shows `scopeEquality.test.ts` ran on the change (§15.3, §17.4). A missing run is a coverage gap for the coordinator, not a run for you to make.

## What this lens does not do

Run no test suite, CI check or formatter comparison; the undirected reviewer owns the red-on-base run and the reading of the head's workflows. Reading the guide and the diff answers every question above. Repository-rule checks that need no process, such as a generated `language/*.json` edited without its YAML source, still belong to you as to every reviewer.
