---
name: file-feature
description: Turn a feature idea into an agreed plan and a Feature ticket by interviewing the user, in rounds of numbered questions with recommended answers, until every design decision is settled, then file the ticket that resolve-issue implements. Use whenever the user proposes new functionality or a change to how something works: a new Sparkdown syntax or directive, an engine behavior, an editor or extension capability, a player feature, or says "I want to add", "feature request", "we should support", "let's build", "can we make it", "plan this out". Use it even when they ask you to implement directly; the plan comes first and implementation follows on the ticket. Not for bugs (use file-bug) or for work already specified in a ticket (use resolve-issue).
---

# File a feature ticket

Takes a feature idea from the user, drives it to a shared understanding through an interview, and files one Feature issue on GitHub carrying the plan. Implementation does not happen here; it happens on the ticket, through the resolve-issue skill, once the plan is agreed.

Why the interview comes first: a feature in this repo usually cuts through the whole pipeline, parser to compiler to engine to player to editor to extension, and the author-facing decision (what the syntax is, what the directive does at each point in preview and play) sits at the top of that chain. A wrong assumption there is paid for at every layer below it. #398 and #392 are what the tickets look like when the decisions were made before the work started; #298 is what it looks like when scope was discovered mid-flight and had to be split afterwards.

## 1. Find the facts before asking anything

Facts are your job; decisions are the user's. Before the first question, learn what already exists so no question wastes a round on something you could have looked up:

- Search the codebase for the concept, not just the word. A feature about "loading" touches `AssetModule`, the `loading` layout, and the `load` arrow; grep for each.
- Read the relevant guide chapter under `packages/sparkdown/docs/guide/` (Structure, ControlFlow, Screens, Components, Widgets, StyleProps, AnimationTheme) and the compiler and runtime docs beside it.
- Search the tracker for prior discussion, open and closed: `gh issue list --state all --search "<concept>" --limit 20`. A closed ticket that decided against the idea is the most useful thing you can find.
- Trace the pipeline for the nearest existing feature of the same shape (a directive, a define type, an editor command) so you can name the packages and the seams a new one would touch.

If this takes real time, dispatch a subagent for the exploration and ask the parts of the first round that do not depend on it while it runs.

## 2. The interview

The technique is adapted from Matt Pocock's grilling skill (github.com/mattpocock/skills, MIT). Treat the design as a tree: every decision branches into the decisions that hang off it. The frontier is the set of decisions whose prerequisites are settled, the ones you can ask now without guessing at answers you have not heard. Ask the whole frontier in one round, numbered, each with your recommended answer, then wait. A question whose answer depends on another question still open in this round belongs to the next round.

Format each round like this:

```
❓ Q1 - <question title>: <question body, with the options where there are options>

➡️ <your recommended answer, and why in one sentence>

---

❓ Q2 - <question title>: ...

➡️ ...
```

Recommend on every question. The user came with an idea, not a spec, and a recommendation they can accept or reject in a word moves faster than an open question. Ground the recommendation in what you found in step 1: "the `load` arrow already does X, so I recommend Y".

Each answered round reshapes the tree. Recompute the frontier and ask the next round. The interview is done when the frontier is empty: every branch visited, nothing left silently assumed. Do not file until the user confirms the understanding is shared. If the user says "just decide" on a branch, take your recommendation and mark the decision "decided by default" in the ticket so a later reader knows it was not chosen deliberately.

Branches that nearly always exist for a feature here, in the order they usually unblock each other:

1. The author's problem. What they are trying to do in a script or in the editor, and what stops them today. Settle this before any surface question; a solution to the wrong problem is the most expensive outcome.
2. The author surface. The syntax, directive, define type, editor control, or extension command. Show a concrete example script. Existing conventions constrain this: directives are `[[name args]]`, arrows are `->` forms, defines are `define <type> <name>` blocks; a new surface that ignores them costs a grammar change in `definitions/yaml/` plus both regenerated JSON copies.
3. Semantics and edge cases. What happens at scene boundaries, inside tunnels and threads, on a checkpoint restore, on a save and load, when the asset or target is missing, when the same thing is invoked twice.
4. Preview versus play. The editor preview is scrub-driven and time-free; play is time-driven. Most features behave differently in each (timed assets load only in play, the loading screen is a no-op in preview) and the difference has to be decided, not discovered.
5. Which surfaces ship it. Web editor, VS Code extension, standalone player, or all three. The compile runs in each, so a compiler change lands everywhere; an editor-only feature does not.
6. What is reused. The existing code, branch, or prior ticket that partly covers it, and whether it is extended or replaced.
7. Tests. Which seam proves it works: a compiler test on the program output, an engine test on module behavior, a player DOM test, a live check in the running editor. Prefer the highest existing seam; new seams are a cost.
8. Scope edges. What is deliberately left out, and whether the work is one pull request or several. A ticket sized to one fresh context window is one resolve-issue run; larger than that, split it (section 3).

Not every feature has all eight, and some have branches this list does not. The list is a checklist against silent assumptions, not a script.

## 3. Size it

If the agreed plan is more than one pull request's worth, split it into vertical slices: each slice cuts a complete path through every layer it touches and is verifiable on its own, rather than one layer at a time. File the feature ticket as the parent with the slice list in its plan, and each slice as a Task issue (template `.github/ISSUE_TEMPLATE/task.md`, type `Task`) that says "Split from #N" and which slices block it. A wide mechanical change (a rename across the codebase) is the exception: sequence it as expand, migrate in batches, contract.

## 4. Write the ticket

Follow `.github/ISSUE_TEMPLATE/feature_request.md`: same headings, same order; its leading comment gives the title convention and the label list. GitHub applies templates only through the web form, so read the file and produce the body yourself, and write it to a file first.

What goes where:

- Title: one sentence naming what the author or player gains, in their terms.
- Problem: the author's problem from step 2, branch 1, in their words.
- Proposed solution: the author surface with the example script, and the semantics decided in the interview. Mark anything still open as "Open"; mark anything taken on your recommendation without a deliberate choice as "decided by default".
- Alternatives considered: every branch the interview rejected, with the reason. This is the part a future reader most wants and most often does not get.
- Scope: what is in, what is out, and what existing code, branch, or ticket is reused, with `file:line` references at a specific commit where that helps.
- Implementation plan: steps in pipeline order (parser, compiler, engine, player, editor, extension), one bullet per step naming the package. Decisions, not code; a snippet only where it captures a decision more precisely than prose (a type shape, a state machine).
- Acceptance criteria: checkboxes a reviewer can tick: the tests that exist and what they prove, what the running editor shows, what a measurement reads.
- Additional context: the prior tickets, the docs chapter to update, the slices if it was split.

Strip the template's HTML comments. Write "Open" under a heading that is still undecided rather than deleting it.

## 5. File it and read it back

```sh
gh issue create --title "<title>" --body-file ticket.md --label "system: sparkdown" --label "app: web-editor"
gh api -X PATCH repos/ImpowerGames/impower/issues/<N> -f type=Feature
gh issue view <N> --json title,body,labels
gh api repos/ImpowerGames/impower/issues/<N> --jq .type.name
```

Never pass `--body @-`; `gh` takes it as the literal two characters and files an empty-looking ticket that still returns a URL. Read the body back and check that it is the body you wrote. The type step is separate because `gh issue create` cannot set one, and the "Check Issue Type" workflow comments on any issue left without it.

Labels: `system: sparkdown` (language, compiler, engine), `system: sparkle-ui` (layout, components, styles, reactive engine, DOM renderer), `app: web-editor` (editor and web player), `app: vscode-extension`, `documentation`. Apply every area the work touches.

## 6. Hand off

Tell the user the issue number and the one-paragraph plan. Implementation is the resolve-issue skill on that number, in a fresh session with the ticket as its brief; do not begin it here, even if the plan looks small. The point of the split is that the plan is reviewed as a plan before any code exists.

## Gotchas

- Heredocs are lossy through some shell paths on this machine. Write the ticket body with the editor tool, not by piping a heredoc.
- A question the user cannot answer because it needs a fact is your question to answer, not theirs. If you catch yourself asking "does the engine already do X?", go and look.
- An interview that stops at the surface (syntax agreed, semantics assumed) produces a ticket that looks complete and is not. Branches 3 and 4 are where most silent assumptions hide.
- If the session is unattended and the user cannot answer, post the round and stop. Filing on your own answers defeats the purpose of the skill.

## Improving this skill

If a step here failed, a branch in the checklist made no sense for your feature, the interview format got in the way, or you hit a trap Gotchas does not list, report it under a "Skill feedback" heading in your final message with the edit you propose, as `CLAUDE.md` describes. If the session has a branch and pull request and you are certain of the fix, make it in this file in its own commit and mention it in the pull request; otherwise the report is enough.
