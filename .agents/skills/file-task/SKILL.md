---
name: file-task
description: File bounded maintenance, tooling, refactoring, documentation, or follow-up work as a GitHub Task. Use for actionable filing requests; defects belong to file-bug, unsettled functionality to file-feature, and implementation to resolve-issue.
---

# File a Task

Turn an authorized filing request into an actionable Task, or reuse an appropriate open issue. Ask only for missing information that prevents an actionable ticket. A sufficiently clear request proceeds without a design interview or another confirmation round.

## Find context and related work

Inspect the request, relevant repository instructions, affected files and prior discussion. Search open and closed issues by the work's concepts and affected area. Read candidate matches before deciding: reuse an appropriate open issue and add only relevant missing scope or evidence; cite related closed work when a new Task is still needed. If the open match has another issue type, use its filing workflow for further changes. A closed match is context, not a reason to silently reopen completed work.

Route reported wrong behavior to [file-bug](../file-bug/SKILL.md) for its reproduction workflow. Route new functionality with unsettled design decisions to [file-feature](../file-feature/SKILL.md). This skill covers bounded work whose intended outcome is already clear; it does not implement the work or triage the backlog.

## Draft and estimate

Before drafting or editing the ticket, read [shared publishing rules](../references/publishing.md) and `.github/ISSUE_TEMPLATE/task.md`. Keep the template headings in order. Define the concrete work, motivation, included and excluded scope, verifiable acceptance criteria, and related issues. Distinguish observed facts from assumptions; resolve factual uncertainty from the repository where possible.

Read [shared issue-field guidance](../references/issue-fields.md) to estimate the complete applicable work and discover the current Effort field and options. Include a concise estimate rationale and material uncertainty under Additional context. Effort describes the filed work, including its verification, rather than the time spent writing the ticket. This workflow assigns Effort; it does not change Priority policy or unrelated metadata.

## Publish and verify

Discover current repository labels and select applicable area/workflow labels. Create with type `Task` and those labels in the creation call, using an editor-authored body file as required by the publishing rules. For an open match, retain its URL and relevant existing content and metadata instead of creating another ticket or silently changing its type.

Assign the actual Effort organization issue field through the shared procedure; a body estimate alone is insufficient. Read back the published body, type, labels and Effort before reporting completion.

If creation or a later write has an uncertain result, inspect the tracker before retrying. Once an issue exists, preserve its URL, intended body and pending metadata. Repair partial publication on that same issue; do not create a duplicate to recover a failed metadata step. If access still prevents verification or repair, report the issue link and the exact incomplete step with the pending estimate instead of claiming it is fully filed.

## Hand off

Give the user the issue link, brief scope and verified Effort, or the remaining publication gap. Leave implementation to [resolve-issue](../resolve-issue/SKILL.md) when requested. At a user handoff, use [notify-user](../notify-user/SKILL.md) for an optional companion alert when available.
