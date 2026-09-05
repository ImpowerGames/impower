---
name: file-bug
description: File a bug ticket in this repo, reproducing the bug first so the ticket carries a working repro, measured evidence, and (where cheap) a root cause. Use whenever the user reports something broken, wrong, crashing, hanging, slow, or regressed and wants it tracked rather than fixed right now, or says "file a bug", "open an issue for this", "log this", "write this up", "ticket this", or a review or subagent surfaces a defect that should become a ticket. Also use when the user asks for "a ticket" without saying which kind and the thing described is a defect. Not for fixing; hand the filed ticket to resolve-issue for that.
---

# File a bug ticket

Turns a report of wrong behavior into one Bug issue on GitHub that a fixer can act on without re-deriving anything. All paths are relative to the repo root (the directory whose `package.json` is named `impower-monorepo`).

The one rule: no reproduction, no ticket. A ticket here is treated as evidence, not instructions, by whoever fixes it (see the resolve-issue skill, section 1). A ticket filed from a description alone sends the fixer chasing a description, and when they cannot reproduce it the ticket is closed as not reproducible and the bug survives, to be reported again later by someone who measures it instead of describing it. That has happened here.

Reproducing is also where the ticket gets its value. With a loop that goes red on the bug in hand, the cause is often a few minutes away, and a ticket with a repro, numbers, and a cause is what lets resolve-issue skip its investigation phase.

## 1. Read the report

Collect what the user has: the surface (web editor, VS Code extension, player), the script or project, the steps, the exact error text, how often it happens, and when it started. Look at whatever they point at.

Ask the user only for what blocks reproduction, in one round: which script, which build, which surface. Everything else is yours to find. Do not interview them about the design; that is the file-feature skill's job and it does not belong on a bug.

Search the tracker before building anything, by concept rather than by the report's wording:

```sh
gh issue list --state all --search "preview freeze first click" --limit 20
```

An open match means you add your reproduction as a comment there instead of filing a duplicate. A closed match is context for the new ticket: cite it, and say what your reproduction shows that the earlier report did not.

### Name the session

Rename this session as soon as you know what the report is about. The session list is how several sessions running at once are told apart at a glance, and a generated title rarely says which bug this one is chasing. Call `set_session_title` with `session_id: "self"`. There is no issue number yet, so the subject stands alone:

```
FILE bug: preview goes black after the first scrub
```

Write the summary yourself, five to ten plain words for the behaviour you are about to reproduce. Section 6 renames it again once the ticket has a number.

The app swaps a title it generated itself without asking. If the user named the session, it asks them first, and it declines outright in an unattended session where nobody can answer. A decline costs nothing — carry on.

## 2. Build the reproduction

The technique here is adapted from Matt Pocock's diagnosing-bugs skill (github.com/mattpocock/skills, MIT): build a tight pass/fail signal first, then minimise. The repo has three seams that reach most bugs.

Compiler, parser, or engine bug (label `system: sparkdown`): write a vitest test that asserts the user's symptom, in the directory that already holds tests for that area:

| Area                                       | Tests live in                                    |
| ------------------------------------------ | ------------------------------------------------ |
| `packages/sparkdown` compiler and lowering | `packages/sparkdown/src/tests/compiler/`         |
| `packages/sparkdown` runtime               | `packages/sparkdown/src/tests/runtime/`          |
| Luau semantics                             | `packages/sparkdown/src/tests/luau-conformance/` |
| Another package                            | that package's `test/` or `src/tests/`           |

Copy a neighbouring test's imports rather than inventing them; in `src/tests/compiler/` the import order in `compileSnapshot.ts` is load-bearing. Run only your file, capped, because parallel or uncapped vitest runs have hard-crashed machines here:

```sh
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=1024" npx vitest run src/tests/compiler/<your>.test.ts --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1
```

Editor, preview, or visual bug (labels `app: web-editor`, `system: sparkle-ui`): write the smallest `.sd` script that shows it and drive it through the running editor with the resolve-issue driver, which boots both dev servers correctly, loads the script, scrubs the preview to a line, and screenshots:

```sh
node .claude/skills/resolve-issue/driver.mjs preflight
node .claude/skills/resolve-issue/driver.mjs up
node .claude/skills/resolve-issue/driver.mjs verify --sd repro.sd --line 6 --shot before.png
node .claude/skills/resolve-issue/driver.mjs down
```

Read the "The driver" and "Gotchas" sections of `.claude/skills/resolve-issue/SKILL.md` before the first run; several failures there look like the bug you are chasing and are not (a black preview from hand-launched servers, a white one from an unmounted game scaffold, a scrub that lands on the old line). Then look at the screenshot. A visual bug is confirmed by what the pixels show, never by DOM geometry, computed styles, or log counts. If you cannot see it, say so; do not describe a screenshot you did not look at.

Dialogue in a repro script is `NAME:` followed by an indented body:

```
$:
  A MOONLIT ROOFTOP

ALICE:
  First line.

BOB:
  Second line.
```

VS Code extension bug (label `app: vscode-extension`): there is no headless driver. Reproduce in a development host if you have one, otherwise reduce to the shared package underneath (most extension behavior comes from `packages/sparkdown` or the language server) and reproduce there. Say in the ticket which of the two you did.

Performance bug: the symptom is a number. Measure it with a harness (a script that times the operation, or the driver with a probe) before and, if you have one, on a control case, and record how each figure was taken and on what. A perception ("feels slow") is a report, not a reproduction.

Non-deterministic bug: raise the rate rather than hunting for a clean repro. Loop the trigger, add stress, narrow timing, and report the rate you reached ("fails 40 of 100 runs").

Then minimise. Cut inputs, steps, and script lines one at a time, re-running after each cut, until every remaining element is load-bearing. A minimal repro is the ticket's Reproduction section and, unchanged, the fixer's regression test.

Confirm it is the user's bug. A loop that goes red on a nearby failure produces a ticket for the wrong defect. The captured symptom (error text, wrong output, timing) must match what was reported.

Keep the artifacts: the test file or `.sd` script, the exact command, its output, the screenshot. They go into the ticket in section 4 and are then deleted from the worktree; the ticket, not the checkout, is where they live.

## 3. When you cannot reproduce it

Stop and report to the user. List what you tried, on which surface and build, and what you saw instead. Ask for the missing piece: the exact project, a screen recording with timestamps, a log, or access to the environment where it happens. Do not file a Bug that claims something happens when you could not make it happen.

If the user, told that, still wants a ticket now, file it with the Reproduction section stating plainly "Not reproduced" and what was tried, so the next reader knows the claim is unverified. That is their call, not yours to make silently.

## 4. Look for the cause, within a budget

With a red loop in hand, spend a bounded effort (an hour of work, not a day) on where the bug comes from. Read the code the loop exercises; form two or three hypotheses that make different predictions; probe the one the loop can distinguish fastest. The repo's tickets routinely carry this, naming the line and quoting it, and it is what makes resolve-issue's fast path possible.

Report it honestly. "Confirmed" means the loop turned green when you changed that line and red when you changed it back, or the value you predicted appeared where you predicted it. Anything less is "suspected", and the ticket says which. Reference code as `file:line` at a specific commit, with a permalink, because code moves and tickets go stale.

Do not fix it. If the fix is obvious, put it under Analysis as a suggested fix; a ticket with a one-line fix still needs the regression test, the suite run, and the live verification that resolve-issue provides, and doing half of that here leaves a worse trail than doing none.

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

One call creates the issue with its type and labels, so it never exists untyped. `gh issue create` cannot set a type, and a hook in `.claude/settings.json` refuses it, along with any `gh api` POST to the issues collection that lacks `type=`. `-F body=@ticket.md` reads the body from the file; never pass `--body @-` or `-f body=@-`, which `gh` takes as literal text. Read the body back and check that it is the body you wrote.

Labels: `system: sparkdown` (language, compiler, engine), `system: sparkle-ui` (layout, components, styles, reactive engine, DOM renderer), `app: web-editor` (editor and web player), `app: vscode-extension`, `documentation`. Apply every area the bug touches.

Then put the number into the session title, so the session and the ticket can be matched up later. Call `set_session_title` with `session_id: "self"`, keeping the summary from section 1 and replacing the word `bug` with the number:

```
FILE #421: preview goes black after the first scrub
```

## 7. Clean up and hand off

Remove the scratch test and repro script from the worktree (`git status --short` must be clean), and bring the dev servers down if you started them. Tell the user the issue number and the one-line finding. If they want it fixed, that is the resolve-issue skill on that number; do not start the fix here.

## Gotchas

- A fresh worktree has no `node_modules`. Install once at its root with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install`; a bare `npm install` fails here because a workspace dependency tries to download its own Chromium from a blocked host. Then check `npx vitest --version` exits 0 before trusting the install.
- Heredocs are lossy through some shell paths on this machine (a `//` comment came out as `/`). Write the ticket body, test file, and repro script with the editor tool, not by piping a heredoc.
- Exit code 0 from vitest does not mean green. A worker killed by the OS exits 0 with no `Test Files` summary. Check the summary lines.
- Do not edit `packages/sparkdown/language/*.json` while probing; they are generated from `definitions/yaml/` and a hook refuses the edit anyway.
- Do not use `git stash` to compare before and after; the stash stack is shared across the worktrees other sessions are using. Copy the file aside and back.
- A repro that only reproduces on a loaded machine is a timing artifact until proven otherwise. Note it, and check whether a vitest suite from another worktree was running.

## Improving this skill

If a step here failed, needed something it does not give, did not fit your bug without saying so, or cost you time on a trap Gotchas does not list, report it under a "Skill feedback" heading in your final message with the edit you propose, as `CLAUDE.md` describes. The fresh-worktree install line above exists because the first agent to follow this skill lost time to it and said so. If the session has a branch and pull request and you are certain of the fix, make it in this file in its own commit and mention it in the pull request; otherwise the report is enough.
