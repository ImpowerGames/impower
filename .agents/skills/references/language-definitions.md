# Generated files — edit the YAML source, never the JSON (silent-revert footgun)

These JSON files are **build artifacts**, generated from YAML sources at the
repo root. Editing them directly _works_ — tests pass, the change ships — and
then the next `definitions` build silently regenerates them and your change
vanishes:

| Generated (do NOT edit)                                             | Source of truth                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/sparkdown/language/sparkdown.language-grammar.json`       | `definitions/yaml/sparkdown.language-grammar.yaml` and `definitions/yaml/sparkdown-luau.language-grammar.yaml` |
| `packages/sparkdown/language/sparkdown-luau.language-grammar.json`  | `definitions/yaml/sparkdown.language-grammar.yaml`       |
| `packages/sparkdown/language/sparkdown.language-config.json`        | `definitions/yaml/sparkdown.language-config.yaml`        |
| `packages/sparkdown/language/sparkdown-luau.language-config.json`   | `definitions/yaml/sparkdown-luau.language-config.yaml`   |
| `packages/sparkdown/language/sparkdown.language-snippets.json`      | `definitions/yaml/sparkdown.language-snippets.yaml`      |
| `packages/sparkdown/language/sparkdown-luau.language-snippets.json` | `definitions/yaml/sparkdown-luau.language-snippets.yaml` |
| `vscode-sparkdown/language/sparkdown.language-grammar.json`         | `definitions/yaml/sparkdown.language-grammar.yaml` and `definitions/yaml/sparkdown-luau.language-grammar.yaml` |
| `vscode-sparkdown/language/sparkdown-luau.language-grammar.json`    | `definitions/yaml/sparkdown.language-grammar.yaml`       |
| `vscode-sparkdown/language/sparkdown.language-config.json`          | `definitions/yaml/sparkdown.language-config.yaml`        |
| `vscode-sparkdown/language/sparkdown-luau.language-config.json`     | `definitions/yaml/sparkdown-luau.language-config.yaml`   |
| `vscode-sparkdown/language/sparkdown.language-snippets.json`        | `definitions/yaml/sparkdown.language-snippets.yaml`      |
| `vscode-sparkdown/language/sparkdown-luau.language-snippets.json`   | `definitions/yaml/sparkdown-luau.language-snippets.yaml` |

(Each YAML source propagates to both `packages/sparkdown/language/` and
`vscode-sparkdown/language/`.)

The grammar has two sources that the build merges into the one
`sparkdown.language-grammar.json`: every `Luau*` rule and every `LUAU_*` (or
`_LUAU_*`) variable lives in `sparkdown-luau.language-grammar.yaml`, and every
other rule and variable, the top-level keys and the root `patterns:` live in
`sparkdown.language-grammar.yaml`. Rules and variables share one namespace
across the two files, a name defined in both fails the build, and the grammar
lint fails a name whose prefix and file disagree.
`sparkdown-luau.language-grammar.json` is the `.luau` file grammar, written
from the story file's `luauFile:` key; it holds no rules of its own.

The sources are easy to miss: they live under `definitions/yaml/` at the repo
root, NOT under `packages/`, and a grep for a rule's expanded regex won't find
them — the YAML uses `{{VARIABLE}}` templating (e.g. `{{WS}}` expands to
`(?:[^\S\n\r])`; the `variables:` blocks of the two grammar YAML files define
them). Rule NAMES do match, so grep for the rule name instead.

To change a grammar/config/snippets rule:

```sh
# 1. edit the rule in definitions/yaml/<file>.yaml
# 2. regenerate BOTH output locations (from the repo root):
cd definitions && npx tsx src/language.ts ../packages/sparkdown/language ../vscode-sparkdown/language
# (equivalent to `npm run language` from inside definitions/)
```

Passing only one output path regenerates only that location and leaves the
other stale — `definitions/package.json`'s `language`/`build` scripts always
pass both paths, so prefer `npm run language` over typing the paths by hand.

Commit the YAML **and** the regenerated JSON together. If your JSON diff
contains a change with no matching YAML diff, the change is doomed.
