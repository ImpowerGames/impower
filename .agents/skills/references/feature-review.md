# Feature review mechanics

All commands run from the worktree root unless stated otherwise.

The two feature review skills share everything below and differ only in the lenses they apply. Each runs in a fresh session whose model differs from the one that filed the feature. That session is the reviewer, the interviewer and the editor of the tickets: it reads the design and the code, keeps its findings in its own context, puts them to the maintainer as questions, and applies what is agreed. Nothing is posted as a review or an adjudication; the agreed edits are the record.

## Independence

Before reading the design, compare models. The ticket's Additional context records `Filed by <model> at reasoning effort <effort>`, which file-feature writes. Read the reviewing session's own model as the [runner notes](../RUNNERS.md) describe. In a same-model session, stop and tell the user to run the skill in a session of a different model; do not review. When the ticket has no `Filed by` line, ask the user which model filed it before going on.

## What is reviewed

The parent Feature and every slice Task it lists, read live from the tracker (`gh issue view N --json title,body,issueType`), and the code at the head of a clean, committed checkout; record that commit so every `file:line` in a finding names it. Keep the whole design in context: a finding either quotes the ticket text or cites the code.

## Anchoring rule

A finding is put to the user only when it states one of: (a) a fact about the existing code with a `file:line` at the named commit; (b) a concrete scenario the tickets do not cover or contradict themselves on, quoting the ticket text; (c) a documented comparison with a named peer system and its source. A concern that cannot be anchored is dropped, or listed once at the end of the interview as an open question with the evidence that would settle it. This rule is what keeps the review from becoming a matter of taste.

## Follow-up rule

A finding that adds capability is a proposed follow-up ticket with a title, never an edit to the design, unless the current design forecloses it later, in which case it is a blocking finding.

## The interview

After the review pass, group the findings into decisions: one decision per design question, however many findings point at it. Ask in rounds, in the format of the [file-feature interview](../file-feature/references/interview.md): every question of the current frontier at once, numbered, each with its evidence in one or two sentences (the quoted ticket text or the `file:line`), the recommended resolution and the ticket edit it implies. Blocking decisions come first. Wait for the answers; a question whose answer depends on one still open belongs to the next round. Recompute the frontier after each round; the interview ends when it is empty. "Just decide" takes the recommendation, marked "decided by default" in the ticket. If the session is unattended and decisions remain open, post the round in the chat and stop; apply nothing, and put nothing on the ticket.

## Apply

When the frontier is empty, edit the tickets under the [shared publishing rules](publishing.md): write each new body with an editor, publish it with `gh issue edit N --body-file <file>`, and read every edited body back. Keep the headings of `.github/ISSUE_TEMPLATE/feature_request.md` and `task.md` in order; mark undeliberated choices "decided by default" and undecided ones "Open". A change to the slicing edits or files Task tickets through [file-task](../file-task/SKILL.md), with the user's agreement. Post one comment on the parent naming the reviewing model, the commit reviewed, each edited ticket with one line on what changed, and the follow-ups proposed with their titles. File a follow-up only when the user asks.

## Hand off

Report the tickets edited, the follow-ups proposed and any question the user deferred.
