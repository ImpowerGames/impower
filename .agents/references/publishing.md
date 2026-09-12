# Publish issues, pull requests and commit messages

Every issue and pull request follows a template under `.github/`. Two skills drive the filing itself and enforce what a template cannot: `file-bug` reproduces the bug before it files (no reproduction, no ticket) and `file-feature` interviews the user until every design decision is settled before it files. Use them whenever you are about to file a bug or a feature; `resolve-issue` then implements the ticket, invoking `write-regression-test`, `drive-web-editor` and `review-pr` at the steps where each applies (all three also run on their own). GitHub only fills a template in for someone using the web form, so when you file from the command line (`gh api`, `gh pr create`) read the template file yourself and produce a body with the same headings in the same order:

| Filing a…                                       | Template                                    |
| ----------------------------------------------- | ------------------------------------------- |
| Bug (wrong behavior, crash, hang, regression)   | `.github/ISSUE_TEMPLATE/bug_report.md`      |
| Feature (new functionality or changed behavior) | `.github/ISSUE_TEMPLATE/feature_request.md` |
| Task (refactor, tooling, perf, docs, follow-up) | `.github/ISSUE_TEMPLATE/task.md`            |
| Pull request                                    | `.github/PULL_REQUEST_TEMPLATE.md`          |

Each template's leading comment gives the title convention and the label list; its `type:` front matter names the issue type to set (`Bug`, `Feature`, or `Task`). GitHub applies that type through the web form, through `gh issue create --type`, and through the REST create call's `type` field. From the command line, create the issue with one call that carries the type, so the issue never exists untyped; the REST call also sets the labels and returns the type for checking:

```sh
gh api -X POST repos/ImpowerGames/impower/issues -f title="<title>" -F body=@ticket.md -f type=Bug -f "labels[]=system: sparkdown"   # type is Bug, Feature, or Task; repeat labels[] per label
```

The shared typed-issue guard in `.agents/hooks/typed-issue-hook.mjs` refuses untyped issue creation through direct CLI and REST calls and refuses GraphQL createIssue mutations. Harness hook definitions invoke the same policy; see `../skills/RUNNERS.md` for activation and coverage. The guard reads command text statically: an endpoint or method built from a shell variable, an alias or a wrapper script is outside its coverage. The typed-creation rule applies even when hooks are unavailable or not trusted.

Keep every heading, write "None", "Unknown", or "Not applicable" with a short reason under one you cannot fill, tick only the issue template's checkbox items you actually did, fill in the pull request template's Type of change and Checklist lines as plain text rather than checkboxes, and strip the HTML comments before filing. After filing, read the artifact back (`gh issue view N --json body`, `gh pr view N --json body`).

A pull request that resolves an issue must carry `Closes #N` in its body (the template's line under Summary). GitHub closes the issue on merge only when a closing keyword and the number appear together in the body; the issue number in the title is a mention and closes nothing. The "Check Linked Issue" workflow fails any pull request whose body has neither a closing reference nor the sentence "No linked issue."; the check is `.github/scripts/check-linked-issue.mjs`, runnable locally with `PR_BODY="$(cat pr-body.md)" node .github/scripts/check-linked-issue.mjs`.

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
gh api -X POST repos/ImpowerGames/impower/issues -f title="x" -F body=@body.md -f type=Bug   # -F reads the file
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
