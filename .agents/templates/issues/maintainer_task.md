---
name: Maintainer task
about: Work only the maintainer can do, filed by the ask-maintainer tool, which refuses an incomplete request.
title: ""
labels: "maintainer: task"
type: Task
assignees: ""
---

<!--
File this with `node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json>`, never by hand. An existing ticket that is itself the maintainer's work is tagged with the tool's `tag` command instead of being copied into a new issue.

Title: the action in one sentence, then the affected tickets in parentheses. Example: "Test the route strip on your phone (#2271)".

Labels: `maintainer: task`. Assignee: the maintainer. No parent, no milestone and no project entry. A task has no fallback.

After the answer line the tool writes who filed the request and one hidden data line starting `maintainer-request`, which is kept when the other comments are stripped.
-->

## What to do

## Why only you

## Steps

## What to expect

## What it holds up

---

**When it's done:** close this issue as completed. If you won't do it, close it as not planned; I'll carry on without it and say what that leaves undone. Comment without closing to ask a question or say what's missing.
