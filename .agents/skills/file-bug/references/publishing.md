# Write and publish the Bug

All commands run from the worktree root unless stated otherwise.

## 5. Write the ticket

Follow `.github/ISSUE_TEMPLATE/bug_report.md`: same headings, same order, the leading comment gives the title convention and the label list. GitHub applies templates only in the web form, so read the file and produce the body yourself. Write the body to a file first; it survives a bad invocation.

What goes where:

- Title: one sentence naming the wrong behavior from the user's point of view, the mechanism in parentheses when you confirmed it. No prefix, no ticket number.
- Description: the symptom in behavior terms, with exact error text quoted.
- Reproduction: numbered steps from a fresh state, then the artifact in a fenced block (the `.sd` script, or the essential body of the test), then the exact command that goes red and its output. For a screenshot, name the file and say what it shows; attach the PNG through the web UI after filing, since `gh` cannot upload images.
- Expected behavior, Actual behavior: short, and the actual one carries the numbers (timings, counts, rates) and how they were taken.
- Environment: the surface, the commit (`git rev-parse --short HEAD`), and OS or browser only when they matter.
- Analysis: the cause with `file:line` permalinks and quoted lines, marked confirmed or suspected, then the suggested fix and anything that must stay true after it. "Unknown" is a valid entry when the budget ran out; say what you ruled out.
- Additional context: how it was found (for example, by an adversarial review of a pull request, naming it), the earlier ticket it relates to, workarounds.

Strip the template's HTML comments. Write "Unknown" under a heading you cannot fill rather than deleting it.

## 6. File it and read it back

```sh
gh api -X POST repos/ImpowerGames/impower/issues -f title="<title>" -F body=@ticket.md -f type=Bug -f "labels[]=system: sparkdown" -f "labels[]=app: web-editor" --jq '{number, url: .html_url, type: .type.name}'
gh issue view <N> --json title,body,labels
```

One call creates the issue with its type and labels, so it never exists untyped. Always supply the type in the creation call, whether hooks run or not: `gh issue create --type` or a REST creation call with `type=`. `-F body=@ticket.md` reads the body from the file; never pass `--body @-` or `-f body=@-`, which `gh` takes as literal text. Read the body back and check that it is the body you wrote.

Labels: `system: sparkdown` (language, compiler, engine), `system: sparkle-ui` (layout, components, styles, reactive engine, DOM renderer), `app: web-editor` (editor and web player), `app: vscode-extension`, `documentation`. Apply every area the bug touches.

Then put the number into the session title, so the session and the ticket can be matched up later. Use the runner's optional session-renaming capability, keeping the summary from section 1 and replacing the word `bug` with the number:

```
FILE #421: preview goes black after the first scrub
```
