---
name: review-spec-experience
description: Adversarially review a filed Feature's author-facing design before any slice is implemented, by writing scripts against its syntax, walking through its editor or extension interface as an author, and enumerating its player scenarios. Use after file-feature, alongside review-spec-engineering, when the feature changes something an author touches.
---

# Review a feature's author experience

Independent reviewers exercise the design of record as an author would, before anything is built, so the gaps an implementer would fill with guesses in the syntax, the interface or the player are found on the tickets. The review edits tickets, never repository files. Before the first step, read [spec review mechanics](../references/spec-review.md): the snapshot, independence, launcher, report, anchoring, adjudication and round rules both spec reviews share.

## 1. Identify the surfaces

Read the parent and every slice and name each surface the feature changes: language (Sparkdown syntax, directives, defines), interface (the web editor, the extension) and player (what plays in the player or the preview). A feature that changes none has no experience review; the engineering review alone applies. Record the surfaces in the round-state comment.

## 2. Freeze the design

Take the snapshot, record the checkout commit, and post the round-state comment on the parent issue. The worktree must be clean and committed; the launcher refuses otherwise.

## 3. Assign exercises

Size the review by the shared count rule. The `undirected` lens is always present; the directed reviewers carry one exercise per surface, combined where the count requires:

- `language`: eight to ten realistic scripts against the proposed syntax, including the first thing a beginner would type and the common mistakes, grounded in the current grammar under `definitions/yaml/` and the guide chapters, with the peer systems of the file-feature prior-art reference as the comparison set. Every place the syntax is ambiguous, verbose, inconsistent with a Sparkdown convention, or leaves the author with no diagnostic or an unhelpful one is a finding.
- `interface`: an imagined walkthrough of four tasks (first use, everyday repeated use, recovering from a mistake, and undoing or removing what the feature added), recorded per step as what the author sees, what the author does, and what the spec leaves unspecified. Every entry in the third column is a finding, and so is a step that conflicts with the existing editor. A new element whose location, trigger, states (empty, loading, error, success) or failure view the tickets do not give makes the spec not reviewable: the reviewer reports that list and stops. `node .agents/skills/review-spec-experience/interface-exercise.mjs check <snapshot.json>` lists the declared elements and what each lacks, with `--element "<name>"` for one described only in prose; `record --element "<name>"` prints the per-task record.
- `player`: the scenario table (timing, interruption, scrub-driven preview versus timed play, missing assets, a script edit mid-preview, checkpoint restore, save and load); each scenario the spec does not decide is a finding.

## 4. Launch and await

The caller supplies the writer identity and effort, a reviewer route distinct from the writer or none, and the launch method; a missing value blocks the review. Build each prompt with the shared builder and launch each reviewer through the launcher with a `target: "issue"` plan, as the mechanics reference describes. Await the launcher; do not edit a ticket while a reviewer runs. Read every report through the paginated API and post any missing report on the reviewer's behalf, verbatim.

## 5. Adjudicate

Confirm each finding against the quoted ticket text, the grammar or the editor source before acting. Post each disposition on the parent issue with the report's comment ID, the round and the snapshot digest, under the anchoring and follow-up rules. A not-reviewable interface report is accepted by adding the missing location, trigger, states and failure view to the ticket, marked "decided by default" where the writer chose them. Accepted findings edit the parent or the affected slice and are read back; the edited tickets remain the design of record. Stop after one round unless accepted edits changed a ticket materially; the cap is two.

## 6. Hand off

Report the surfaces reviewed, the reviewed snapshot digest, every report and adjudication by comment ID, the edited tickets, the follow-ups with proposed titles, and any reviewer that did not report. At completion, or when yielding for input or help, provide the normal chat handoff and invoke [notify-user](../notify-user/SKILL.md) for an optional companion alert identifying the work and next action. Use `done` when no action is needed, `user_input_needed` for a question or a decision on an accepted edit, or `blocked` when progress requires help. If the notifier is unavailable, skip it silently.
