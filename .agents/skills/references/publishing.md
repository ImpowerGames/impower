# Publish issues, pull requests and commit messages

Every issue follows a template under `.agents/templates/issues/` and every pull request the template under `.github/`. Use `file-bug` to reproduce and file a defect, `file-feature` to settle design decisions and file a Feature, and [file-task](../file-task/SKILL.md) to file bounded maintenance or follow-up work without a mandatory interview. `resolve-issue` implements a specified ticket using regression, live verification and review at the applicable steps. GitHub only fills a template in for someone using the web form, so when you file from the command line (`gh api`, `gh pr create`) read the template file yourself and produce a body with the same headings in the same order:

| Filing a…                                       | Template                                      |
| ----------------------------------------------- | --------------------------------------------- |
| Bug (wrong behavior, crash, hang, regression)   | `.agents/templates/issues/bug_report.md`      |
| Feature (new functionality or changed behavior) | `.agents/templates/issues/feature_request.md` |
| Task (refactor, tooling, perf, docs, follow-up) | `.agents/templates/issues/task.md`            |
| Pull request                                    | `.github/PULL_REQUEST_TEMPLATE.md`            |

Until the cutover below, the public issue form under `.github/ISSUE_TEMPLATE/` serves identical copies of the three issue templates; edit a template under `.agents/templates/issues/` and mirror it there, which `.agents/templates/templates.test.mjs` checks. At the cutover the public form changes to the human-facing bug report and feature request under `.agents/templates/public/`.

## The tickets repository

Tickets (issues, their comments, fields, dependencies and the feedback inbox) live in the tickets repository; code, CI and pull requests always live in the code repository. `.agents/repos.json` names both and holds a cutover switch. While the switch is off, the tickets repository is the code repository; once the cutover commit turns it on, tickets live in the internal repository that file names. `node .agents/repos.mjs tickets` prints the tickets repository for the switch as committed, and `node .agents/repos.mjs inbox` the feedback inbox number. Scripts read the same values.

Commands in the skills write `<tickets>` for that slug and `<inbox>` for the inbox number: substitute the printed value literally, not through a shell substitution, which the typed-issue guard cannot read. Give every `gh issue` command `-R <tickets>`, and read tickets through `gh issue -R <tickets>` or the REST API (`gh api repos/<tickets>/issues/N`), never `gh api graphql`, which the guard refuses for ticket reads once the switch is on. A `#N` written inside a ticket names a ticket; written in a pull request body after the cutover it names a pull request.

Each template's leading comment gives the title convention and the label list; its `type:` front matter names the issue type to set (`Bug`, `Feature`, or `Task`). GitHub applies that type through the web form, through `gh issue create --type`, and through the REST create call's `type` field. From the command line, create the issue with one call that carries the type, so the issue never exists untyped; the REST call also sets the labels and returns the type for checking:

```sh
gh api -X POST repos/<tickets>/issues -f title="<title>" -F body=@ticket.md -f type=Bug -f "labels[]=system: sparkdown"   # type is Bug, Feature, or Task; repeat labels[] per label
```

The shared typed-issue guard in `.agents/hooks/typed-issue-hook.mjs` refuses untyped issue creation through direct CLI and REST calls and refuses GraphQL createIssue mutations. Harness hook definitions invoke the same policy; see `../RUNNERS.md` for activation and coverage. The guard reads command text statically: an endpoint or method built from a shell variable, an alias or a wrapper script is outside its coverage. The typed-creation rule applies even when hooks are unavailable or not trusted.

Keep every heading, write "None", "Unknown", or "Not applicable" with a short reason under one you cannot fill, tick only the issue template's checkbox items you actually did, fill in the pull request template's Type of change and Checklist lines as plain text rather than checkboxes, and strip the HTML comments before filing. After filing, read the artifact back (`gh issue view N -R <tickets> --json body`, `gh pr view N --json body`).

A pull request that resolves an issue must carry a closing reference in its body (the template's line under Summary): `Closes #N` while the cutover switch is off, and `Closes <tickets>#N` once it is on, since a bare `#N` in the code repository then names a pull request. GitHub closes the issue on merge only when a closing keyword and the reference appear together in the body; the issue number in the title is a mention and closes nothing. The "Check Linked Issue" workflow reads the switch and fails any pull request whose body has neither a closing reference (once the switch is on, at least one to the tickets repository; a bare `#N` passes only beside one) nor the sentence "No linked issue."; the check is `.github/scripts/check-linked-issue.mjs`, runnable locally with `PR_BODY="$(cat pr-body.md)" node .github/scripts/check-linked-issue.mjs`.

## Multi-line bodies for `gh` and `git` (silent-corruption footgun)

Allocate a private attempt directory before authoring publication files. Resolve-issue writers use its [initial allocator](../resolve-issue/SKILL.md#0-preflight) and returned absolute `commitMessage` and `prBody` paths, including for the first commit and draft PR before a PR number exists. Other filing routes use their own exclusive per-agent allocation. A coordinating session's scratch directory may be shared by subagents; generic example names below belong inside the allocated directory. Each retry gets a fresh directory, including retries for the same issue. Logs, reproductions and image attachments use that same private directory.

`@-` means "read stdin" to **curl**, not to `gh` or `git`. Both accept it as a
**literal string** and exit 0, so the command looks like it worked:

```sh
gh pr create --body @- <<'EOF'    # WRONG — body is the 2 chars "@-"
git commit -m @- <<'EOF'          # WRONG — message is the 2 chars "@-"
```

Use the file flags instead (`-` means stdin):

```sh
gh pr create    --body-file body.md     # or --body-file -
gh api -X POST repos/<tickets>/issues -f title="x" -F body=@body.md -f type=Bug   # -F reads the file
gh issue edit N -R <tickets> --body-file body.md     # also how you repair a mangled one
git commit -F msg.txt                   # or -F -
```

Inline `--body "..."` / `-m "..."` is fine; it's only the `@-` form that breaks.

**Failure signature:** `gh` prints a real issue/PR URL and returns 0, and `git`
creates a real commit — the damage is only visible if you read the artifact
back. This has already shipped a merged PR with an empty description.

**So: after publishing anything, read it back.** `gh pr view N --json body`,
`gh issue view N -R <tickets> --json body`, `git log -1`. Prefer writing the body to a file
first — it survives a bad invocation and can be re-applied with `--body-file`.

## Attach images and videos

`gh issue create`, `gh issue edit`, `gh issue comment`, `gh pr create`, `gh pr edit` and `gh pr comment` upload files with `--attach`, which needs GitHub CLI 2.99.0 or later (`gh --version`); an older `gh` refuses the flag as unknown, and upgrading it is the fix. Embed each file in the body where it belongs, using the same relative path you pass to `--attach`, and run the command from the directory that holds the files. The upload rewrites each reference to the hosted file, so the image renders in place:

```sh
cd <scratch-dir-with-the-pngs>
gh issue edit N -R <tickets> --body-file body.md --attach ./before.png --attach ./after.png   # body.md contains ![Before the fix](./before.png)
```

Alt text written in the body is kept. A file passed to `--attach` that the body does not reference is appended at the end, with its file name as alt text unless you add `#<alt text>` after the path. The uploaded file is readable by anyone who has its URL, so crop out anything private before uploading. Read the body back: every reference should now start with `https://github.com/user-attachments/`. A relative path still in the body means that upload failed; the command then exits non-zero but still applies the uploads that worked.

A runner's shell tool may also collapse every doubled backslash in a command to
one before the shell sees it, inside quotes and quoted heredocs alike; the
[runner notes](../RUNNERS.md) say which tools do. A hook refuses such a command.
For anything with code in it, write the file with the editor capability rather
than piping a heredoc; a heredoc with no doubled backslash is fine.
