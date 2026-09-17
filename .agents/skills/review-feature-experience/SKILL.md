---
name: review-feature-experience
description: Adversarially review a filed Feature's author-facing design by writing scripts against its syntax, walking through its editor or extension interface as an author, and enumerating its player scenarios, then agree the corrections with the maintainer in an interview and apply them to the tickets. Run in a fresh session of a different model than the one that filed the feature, alongside review-feature-engineering, when the feature changes something an author touches.
---

# Review a feature's author experience

This session exercises the design of record as an author would, before anything is built, so the gaps an implementer would fill with guesses in the syntax, the interface or the player are settled on the tickets with the maintainer. The review edits tickets, never repository files. Before the first step, read [feature review mechanics](../references/feature-review.md): the independence check, what is reviewed, the anchoring and follow-up rules, and the interview and apply steps both feature reviews share.

## 1. Check independence and identify the surfaces

Compare the ticket's `Filed by` model with this session's model and stop in a same-model session. Read the parent and every slice it lists, record the clean checkout's commit, and name each surface the feature changes: language (Sparkdown syntax, directives, defines), interface (the web editor, the extension) and player (what plays in the player or the preview). A feature that changes none has no experience review: a sliced one takes the engineering review alone, and an unsliced one needs no feature review.

## 2. Exercise every surface

Keep each finding in context with its anchor as it is found. Start with an undirected pass over the whole design as an author would use it, then apply the exercise of each surface:

- Language: write eight to ten realistic scripts against the proposed syntax in a private file: the first thing a beginner would type, the everyday case, and the common mistakes (a missing keyword, a misspelled option, a value of the wrong kind, the old spelling of something the design renames). Ground each script in the current grammar under `definitions/yaml/` and the guide chapters under `packages/sparkdown/docs/guide/`, and compare the syntax with the peer systems in [prior-art research](../file-feature/references/prior-art.md). Note every place the syntax is ambiguous, verbose, inconsistent with an existing Sparkdown convention, or leaves the author with no diagnostic or an unhelpful one, quoting the script and the ticket text that decides it or fails to.
- Interface: nothing is built yet, so walk through the tasks an author would perform using the flow the tickets describe. First run `node .agents/skills/review-feature-experience/interface-exercise.mjs check --issue <parent> --issue <slice>` over the tickets that describe the interface: it lists each declared `Interface element:` block and the items it lacks among location, trigger, states (empty, loading, error, success) and failure view; for an element the tickets describe only in prose, add `--element "<name>"` and judge the four items against the prose. A missing item is a question for the maintainer, asked before the walkthrough and applied to the ticket, because the exercise cannot start without it. Then run `node .agents/skills/review-feature-experience/interface-exercise.mjs record --element "<name>"` and fill the record for the four required tasks: first use, everyday repeated use, recovering from a mistake, and undoing or removing what the feature added. Each step holds what the author sees, what the author does, and what the tickets leave unspecified; every entry in the third column is a finding, and so is a step that conflicts with how the existing editor works, checked by reading its source under `impower-dev/` and, when the session can, by opening the running editor through the [editor driver](../drive-web-editor/SKILL.md).
- Player: enumerate the scenario table and note each scenario the tickets do not decide, quoting the text that comes closest: timing (when it starts, how long it lasts, what ends it); interruption by the next line, a choice or a scene change; scrub-driven preview versus timed play; a missing or failed asset; a script edit while the preview is showing it; checkpoint restore; save and load; and two instances running at once.

## 3. Interview the maintainer

Group the findings into decisions and ask in rounds as the mechanics reference describes: the interface items an element lacks and the blocking decisions first, each with its evidence, the recommended resolution and the edit it implies. Continue until the frontier is empty.

## 4. Apply the agreed edits

Edit the parent and the affected slices, including the `Interface element:` blocks the answers complete, read each back, and post the one summary comment on the parent.

## 5. Hand off

Report the surfaces reviewed, the tickets edited, the follow-ups proposed with their titles, and any question the maintainer deferred. At completion, or when yielding for input or help, provide the normal chat handoff and invoke [notify-user](../notify-user/SKILL.md) for an optional companion alert identifying the work and next action. Use `done` when no action is needed, `user_input_needed` when a round of questions is waiting, or `blocked` when progress requires help. If the notifier is unavailable, skip it silently.
