# Working in this repo

## Running the live editor / game preview

To see a change in the running editor or game preview, launch BOTH dev servers
with one command from the repo root:

```sh
npm run web:dev                # same-origin (default)
npm run web:dev:cross-origin   # separate-origin iframe
```

It auto-picks free ports (never colliding with another worktree's servers),
wires every cross-referencing env var consistently, waits for readiness, and
prints the editor URL. `Ctrl+C` stops both. Override ports with `EDITOR_PORT` /
`PLAYER_PORT` / `HMR_PORT` if needed. Same-origin mode (the default) lets you
inspect the live game DOM from the editor page via `window.__preview`.

**Do NOT hand-launch the editor (`impower-dev`) and player (`sparkdown-player-app`)
separately** unless you fully understand the handshake below — it's a footgun.

### Failure signature & why it happens

The editor embeds the player as an `<iframe>` and they connect over a
postMessage + MessageChannel handshake. The wiring that must agree:

- Editor needs `VITE_SPARKDOWN_PLAYER_ORIGIN` = the player's real origin (it's
  the iframe `src`), plus a unique `HMR_PORT` (the default collides when another
  editor is already running → its Vite HMR websocket fails → the page reloads in
  a loop).
- Player needs `VITE_SPARKDOWN_EDITOR_ORIGIN` = the editor's origin so its
  handshake replies `postMessage` to the right place. (On `localhost` the player
  now relaxes this — it learns the editor's origin from the first message — but
  prod stays strict.)

These are **build-time** Vite vars baked into each bundle, so a page reload
won't fix a wrong value — you must restart the server. Get any of them wrong and
the **Game Preview is fully black, even on PLAY** (the editor never completes
`connect`/`Initialize`, so the game never runs); the editor pane itself looks
fine. `npm run dev:preview` exists precisely so you never have to get this right
by hand.

OPFS project storage is **per-origin**, so a project saved at one editor port is
invisible at another — use the URL the launcher prints.

## Filing issues and pull requests — follow the templates

Every issue and pull request follows a template under `.github/`. GitHub only fills a template in for someone using the web form, so when you file from the command line (`gh issue create`, `gh pr create`) read the template file yourself and produce a body with the same headings in the same order:

| Filing a…                                        | Template                                    |
| ------------------------------------------------ | ------------------------------------------- |
| Bug (wrong behavior, crash, hang, regression)    | `.github/ISSUE_TEMPLATE/bug_report.md`      |
| Feature (new functionality or changed behavior)  | `.github/ISSUE_TEMPLATE/feature_request.md` |
| Task (refactor, tooling, perf, docs, follow-up)  | `.github/ISSUE_TEMPLATE/task.md`            |
| Pull request                                     | `.github/PULL_REQUEST_TEMPLATE.md`          |

Each template's leading comment gives the title convention and the label list; its `type:` front matter names the issue type to set (`Bug`, `Feature`, or `Task`). Keep every heading, write "Not yet known" or "Not applicable" under one you cannot fill, and strip the HTML comments before filing. After filing, read the artifact back (`gh issue view N --json body`, `gh pr view N --json body`).

## Multi-line bodies for `gh` and `git` (silent-corruption footgun)

`@-` means "read stdin" to **curl**, not to `gh` or `git`. Both accept it as a
**literal string** and exit 0, so the command looks like it worked:

```sh
gh pr create --body @- <<'EOF'    # WRONG — body is the 2 chars "@-"
git commit -m @- <<'EOF'          # WRONG — message is the 2 chars "@-"
```

Use the file flags instead (`-` means stdin):

```sh
gh pr create    --body-file body.md     # or --body-file -
gh issue create --body-file body.md
gh issue edit N --body-file body.md     # also how you repair a mangled one
git commit -F msg.txt                   # or -F -
```

Inline `--body "..."` / `-m "..."` is fine; it's only the `@-` form that breaks.

**Failure signature:** `gh` prints a real issue/PR URL and returns 0, and `git`
creates a real commit — the damage is only visible if you read the artifact
back. This has already shipped a merged PR with an empty description.

**So: after publishing anything, read it back.** `gh pr view N --json body`,
`gh issue view N --json body`, `git log -1`. Prefer writing the body to a file
first — it survives a bad invocation and can be re-applied with `--body-file`.

Heredocs are also lossy through some shell paths here (a `//` comment came out
as `/`, breaking a file mid-edit). For anything with code in it, write the file
with the editor tool rather than piping a heredoc.

## Generated files — edit the YAML source, never the JSON (silent-revert footgun)

These JSON files are **build artifacts**, generated from YAML sources at the
repo root. Editing them directly *works* — tests pass, the change ships — and
then the next `definitions` build silently regenerates them and your change
vanishes:

| Generated (do NOT edit)                                             | Source of truth                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/sparkdown/language/sparkdown.language-grammar.json`        | `definitions/yaml/sparkdown.language-grammar.yaml`      |
| `packages/sparkdown/language/sparkdown.language-config.json`         | `definitions/yaml/sparkdown.language-config.yaml`       |
| `packages/sparkdown/language/sparkdown.language-snippets.json`       | `definitions/yaml/sparkdown.language-snippets.yaml`     |
| `vscode-sparkdown/language/sparkdown.language-grammar.json`          | `definitions/yaml/sparkdown.language-grammar.yaml`      |
| `vscode-sparkdown/language/sparkdown.language-config.json`           | `definitions/yaml/sparkdown.language-config.yaml`       |
| `vscode-sparkdown/language/sparkdown.language-snippets.json`         | `definitions/yaml/sparkdown.language-snippets.yaml`     |

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

## Strict rule — LOOK. Never guess.

When working on code or assets that affect the impower-dev web editor or visuals or images (ui, prototypes, portraits, renders, animations, layout, color, anything you can see), **verify by actually looking at the rendered pixels — screenshot and view it (zoom in for small details).** LOOK before considering your work done. This is a hard requirement, not a nice-to-have:

- **Never** substitute reasoning from computed styles, `getBoundingClientRect` geometry, greps, log counts, file names, or "it should be rendering" for an actual look. Those mislead.
- If you genuinely can't see something or can't verify it visually, **say so plainly.** Never claim you see something you haven't actually looked at — do not fabricate a visual confirmation.

This has been a repeated failure mode. Looking IS the check. Lead with your eyes, early and often, like a human would. Use the browser screenshot/zoom tools if you need to.
