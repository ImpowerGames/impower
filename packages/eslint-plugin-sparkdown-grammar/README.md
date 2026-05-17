# `@impower/eslint-plugin-sparkdown-grammar`

ESLint rules that enforce sparkdown-grammar YAML conventions over
`definitions/yaml/sparkdown.language-grammar.yaml`. The rules surface
mistakes _while authors are writing the grammar_, instead of at
build time (or worse, at runtime in the editor).

Each rule encodes a convention from `packages/sparkdown/GRAMMAR.md`.
The rule's message includes the section reference so it doubles as a
pointer back to the rationale.

## Rules

| Rule                          | Level   | Encodes                                                                                           |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `tag-name-symmetry`           | error   | §7. Any rule with `tag:` must also have `name:`.                                                  |
| `parse-tag-valid`             | error   | §7. `tag:` values must parse and reference real `@lezer/highlight` tags.                          |
| `no-raw-whitespace-class`     | error   | §12. `\s` outside character classes crosses newlines — use `{{WS}}` (or the right WS variable).   |
| `no-handwritten-alternation`  | warn    | §4. Inline `(?:a\|b\|c)` keyword alternations should live in `variables:` as a list.              |
| `capturing-var-naming`        | error   | §4.4. Variables whose values have capture groups must be named `_NAME_`.                          |

## Setup

The repo wires this plugin up automatically via the root
`eslint.config.js`. Install the recommended VS Code extension
(`dbaeumer.vscode-eslint`) and the rules show as squiggles in the
YAML file.

To run from the command line:

```
npx eslint definitions/yaml/sparkdown.language-grammar.yaml
```

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
