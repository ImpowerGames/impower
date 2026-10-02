# `@impower/eslint-plugin-sparkdown-grammar`

ESLint rules that enforce sparkdown-grammar YAML conventions over
`definitions/yaml/sparkdown.language-grammar.yaml`. The rules surface
mistakes _while authors are writing the grammar_, instead of at
build time (or worse, at runtime in the editor).

Each rule encodes a convention from
[`packages/sparkdown/docs/compiler/GRAMMAR.md`](../sparkdown/docs/compiler/GRAMMAR.md).
The rule's message includes the section reference so it doubles as a
pointer back to the rationale.

## Rules

| Rule                             | Level            | Encodes                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tag-name-symmetry`              | error, baselined | §8. A rule with `tag:` must also have `name:`, and a rule with `name:` must also have `tag:`.                                                                                                                                                                                                                                            |
| `parse-tag-valid`                | error            | §8. `tag:` values must parse and reference real `@lezer/highlight` tags.                                                                                                                                                                                                                                                                 |
| `no-raw-whitespace-class`        | error            | §12. `\s` outside character classes crosses newlines — use `{{WS}}` (or the right WS variable).                                                                                                                                                                                                                                          |
| `no-handwritten-alternation`     | warn             | §7.1. Inline `(?:a\|b\|c)` keyword alternations should live in `variables:` as a list.                                                                                                                                                                                                                                                   |
| `capturing-var-naming`           | error            | §7.4. Variables whose resolved values (after `{{NAME}}` substitution) have capture groups must be named `_NAME_`, and only those.                                                                                                                                                                                                        |
| `no-zero-width-in-patterns`      | error            | §12. A rule that can match zero characters must not be included in a `patterns:` list, directly or through a `Switch` rule.                                                                                                                                                                                                              |
| `no-newline-in-lookaround`       | error            | §11.5. Lookarounds must not try to span line boundaries, which VS Code's line-at-a-time tokenizer cannot see.                                                                                                                                                                                                                            |
| `lookaround-needs-rival-comment` | error, baselined | §10, §10.2. Every `(?!…)`, `(?<=…)` and `(?<!…)`, and every `(?=…)` that is not a line-end or `{{BEAT}}` bail-out (positive lookaheads in `end:` are exempt), in a rule's `match`/`begin`/`end` or a variable, needs a `# lookaround:` comment directly above its rule or variable that names an existing rival rule or variable. |
| `no-unreferenced-rule`           | error, baselined | §7. Every repository rule must be reachable from the top-level `patterns:` through `include`s. A rule TypeScript reads by name is exempt with a `# referenced-from: <file>` comment above it.                                                                                                                                         |
| `no-unreferenced-variable`       | error, baselined | §7. Every variable must be expanded by some `{{NAME}}`. A variable TypeScript reads from `GRAMMAR_DEFINITION.variables` is exempt with a `# referenced-from: <file>` comment above it.                                                                                                                                                 |
| `no-repeated-fragment`           | error, baselined | §7. A `(?:…)` group longer than 12 characters written verbatim in two or more patterns should be a variable (the message names the variable when one already holds it).                                                                                                                                                                 |
| `name-long-pattern-parts`        | error, baselined | §7.2. A pattern with more than two `(?:…)` groups, or a lookaround nested inside another, should name its parts as variables.                                                                                                                                                                                                           |
| `scoped-end-has-bailout`         | error, baselined | §3.1, §18. A `begin`/`end` rule's `end:` must contain `{{BEAT}}` or a `$` (directly or through its variables), so a missing closer cannot run on to the end of the document.                                                                                                                                                            |

The root `eslint.config.js` enables every rule at the level shown, which
is also the plugin's `recommended` configuration.

### Writing a `# lookaround:` comment

Put it in the comment block directly above the rule's key, the variable's
key, an inline rule's `- ` line or the pattern's own key; a blank line
ends the block. Name the rival rule (or variable) the lookaround steps
aside for and say why §10.1's structural fixes do not work. One comment
covers every lookaround its rule or variable holds. For example, with
made-up rule names:

```yaml
# lookaround: steps aside for FunctionCall, which every Switch includes
# after this rule; including FunctionCall first would let it claim `f (`.
Variable:
  match: (?!{{FUNCTION_CALL_START}}){{IDENTIFIER}}
```

The rule checks only that the comment exists and names a rule or
variable other than its own; whether the reason holds is the reviewer's
call.

## Baseline

The rules marked _baselined_ were added after the grammar already broke
them. `baseline.json` records, per rule, how many findings each _owner_
(a repository rule `repository.Name` with every inline rule inside it, a
variable `variables.NAME`, or the top-level `patterns`) had when the
rule was added. The recommended configuration passes each rule its
section: an owner at or under its count reports nothing, and an owner
over it reports every one of its findings as an error, since the rule
cannot tell which one is new. So a new rule, variable or lookaround
fails CI, while the existing debt does not.

To list the baselined findings as warnings, override a rule with an
empty baseline (zero errors, one warning per existing finding):

```
npx eslint --rule '{"sparkdown-grammar/lookaround-needs-rival-comment": ["warn", {"baseline": {}}]}' definitions/yaml/sparkdown.language-grammar.yaml
```

To print every baselined rule's counts, with the owners whose findings
rose or fell, or to rewrite the file after fixing findings:

```
node packages/eslint-plugin-sparkdown-grammar/src/baseline-cli.ts
node packages/eslint-plugin-sparkdown-grammar/src/baseline-cli.ts --write
```

Lower the baseline in the change that fixes findings. A count that falls
is not an error, so concurrent fixes do not collide, but until the file
is lowered the debt could come back unnoticed. Raise it only for debt a
reviewer has accepted. The `no-unreferenced-*` entries name the same
rules and variables as the known-exception lists in
`packages/sparkdown/src/tests/compiler/grammarReachability.test.ts`, and
`no-unreferenced-rule.test.ts` fails when the two disagree.

## Setup

The repo wires this plugin up automatically via the root
`eslint.config.js`. Install the recommended VS Code extension
(`dbaeumer.vscode-eslint`) and the rules show as squiggles in the
YAML file.

To run from the command line:

```
npx eslint --max-warnings 0 definitions/yaml/sparkdown.language-grammar.yaml
```

The typecheck workflow (`.github/workflows/typecheck.yml`) runs that
command on every pull request that changes `definitions/yaml/**`, so a
warning fails CI as an error does. The same job runs the rule tests,
`node --test packages/eslint-plugin-sparkdown-grammar/src/rules/*.test.ts`.

## Implementation notes

- The plugin is loaded by ESLint with Node's native type stripping
  (Node 22+ `--experimental-strip-types`, on-by-default in Node 23).
  No build step.
- YAML is parsed via `yaml-eslint-parser` (provided by
  `eslint-plugin-yml`). The shared `utils/yaml-ast.ts` describes just
  the AST shape the rules depend on so we don't pull in private
  internals.
- Rule logic is conservative: false negatives are preferred over
  false positives. Anything flagged is meant to be a real concern, not
  a style nit.
