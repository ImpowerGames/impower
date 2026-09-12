# Generated files — edit the YAML source, never the JSON (silent-revert footgun)

These JSON files are **build artifacts**, generated from YAML sources at the
repo root. Editing them directly _works_ — tests pass, the change ships — and
then the next `definitions` build silently regenerates them and your change
vanishes:

| Generated (do NOT edit)                                        | Source of truth                                     |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `packages/sparkdown/language/sparkdown.language-grammar.json`  | `definitions/yaml/sparkdown.language-grammar.yaml`  |
| `packages/sparkdown/language/sparkdown.language-config.json`   | `definitions/yaml/sparkdown.language-config.yaml`   |
| `packages/sparkdown/language/sparkdown.language-snippets.json` | `definitions/yaml/sparkdown.language-snippets.yaml` |
| `vscode-sparkdown/language/sparkdown.language-grammar.json`    | `definitions/yaml/sparkdown.language-grammar.yaml`  |
| `vscode-sparkdown/language/sparkdown.language-config.json`     | `definitions/yaml/sparkdown.language-config.yaml`   |
| `vscode-sparkdown/language/sparkdown.language-snippets.json`   | `definitions/yaml/sparkdown.language-snippets.yaml` |

(Each YAML source propagates to both `packages/sparkdown/language/` and
`vscode-sparkdown/language/`; `definitions/yaml/sparkdown.language-completions.yaml`
exists but is not currently propagated.)

The sources are easy to miss: they live under `definitions/yaml/` at the repo
root, NOT under `packages/`, and a grep for a rule's expanded regex won't find
them — the YAML uses `{{VARIABLE}}` templating (e.g. `{{WS}}` expands to
`(?:[^\S\n\r])`; the `variables:` block near the top of the grammar YAML defines
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
