# Write and publish the Feature

All commands run from the worktree root unless stated otherwise.

## 5. Write the ticket

Follow `.github/ISSUE_TEMPLATE/feature_request.md`: same headings, same order; its leading comment gives the title convention and the label list. GitHub applies templates only through the web form, so read the file and produce the body yourself, and write it to a file first.

What goes where:

- Title: one sentence naming what the author or player gains, in their terms.
- Problem: the author's problem from step 3, branch 1, in their words.
- Proposed solution: the author surface with the example script, and the semantics decided in the interview. Mark anything still open as "Open"; mark anything taken on your recommendation without a deliberate choice as "decided by default".
- Alternatives considered: every branch the interview rejected, with the reason, and how the prior-art systems handle it where that shaped the choice ("Ren'Py does X; we chose Y because"). This is the part a future reader most wants and most often does not get.
- Scope: what is in, what is out, and what existing code, branch, or ticket is reused, with `file:line` references at a specific commit where that helps.
- Implementation plan: steps in pipeline order (parser, compiler, engine, player, editor, extension), one bullet per step naming the package. Decisions, not code; a snippet only where it captures a decision more precisely than prose (a type shape, a state machine).
- Acceptance criteria: checkboxes a reviewer can tick: the tests that exist and what they prove, what the running editor shows, what a measurement reads.
- Additional context: the prior tickets, the docs chapter to update, the slices if it was split, the line `Filed by <model> at reasoning effort <effort>` with this session's model and reasoning effort read as the runner notes describe (the reasoning effort, not the ticket's Effort field). A feature review the maintainer chooses to run reads the `Filed by` line to confirm it runs on a different model. If the interview produced a draft document, embed it here under a `<details>` block and name it the design of record; a slice then moves it into the repo.

Each new editor or extension element gets a block under Proposed solution that the experience review checks mechanically, with the four items the interview settled. Write it outside or inside a fence, its labels as bullets or bare lines, plain or bold, and put a label's text on the label line or on bullets nested under it:

```
Interface element: Morph pause toggle
- Location: the preview top bar, right of the scrub controls
- Trigger: a click, or the preview menu's Pause motion item
- States: off (motion plays, the default); on (motion frozen at the rest pose); no empty or loading state because it needs no data; hidden when the project declares no morph
- Failure view: when the player refuses the pause flag, the toggle returns to off and the preview status line says why
```

Strip the template's HTML comments. Write "Open" under a heading that is still undecided rather than deleting it.

## 6. File it and read it back

```sh
gh api -X POST repos/ImpowerGames/impower/issues -f title="<title>" -F body=@ticket.md -f type=Feature -f "labels[]=system: sparkdown" -f "labels[]=app: web-editor" --jq '{number, url: .html_url, type: .type.name}'
gh issue view <N> --json title,body,labels
```

One call creates the issue with its type and labels, so it never exists untyped. Always supply the type in the creation call, whether hooks run or not: `gh issue create --type` or a REST creation call with `type=`. `-F body=@ticket.md` reads the body from the file; never pass `--body @-` or `-f body=@-`, which `gh` takes as literal text. Read the body back and check that it is the body you wrote.

Labels: `system: sparkdown` (language, compiler, engine), `system: sparkle-ui` (layout, components, styles, reactive engine, DOM renderer), `app: web-editor` (editor and web player), `app: vscode-extension`, `documentation`. Apply every area the work touches.

Then put the number into the session title, so the session and the ticket can be matched up later. Use the runner's optional session-renaming capability, keeping the summary from section 1 and replacing the word `feature` with the number:

```
FILE #421: preload images named in an upcoming scene
```
