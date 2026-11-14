---
name: ask-maintainer
description: File a maintainer decision or maintainer task as a GitHub issue through a tool that refuses an incomplete request, uploads its pictures into place and blocks the tickets it holds up. Use wherever a coordinator or stand-alone session would otherwise stop or hold work for the maintainer; a writer under a coordinator asks its coordinator instead.
---

# Ask the maintainer

A maintainer request is an issue in the tickets repository, typed Task, labelled `maintainer: decision` or `maintainer: task`, assigned to the maintainer, with no parent, milestone or project entry. It holds up each ticket it names through a `blocked_by` dependency. GitHub is the one list the maintainer reads, on a phone or a desktop. The tool, `maintainer-request.mjs` in this folder, files it; never file or edit one by hand.

## When to file

File a request at any point where you would otherwise stop, hold work, or ask the maintainer in chat: a choice between designs, a deviation from a ticket, a rule that does not cover the case, or work only the maintainer can do. A writer dispatched by a coordinator sends its question to the coordinator, which files the request. Interviews the maintainer is taking part in (file-feature and the feature reviews) ask in the conversation, not here.

- **A decision** asks one question with two to five options.
- **A task** is something only the maintainer can do: draw art, test on a real phone, merge a ready pull request when a run stops at ready, create an account. An existing ticket that is itself the maintainer's work is tagged with `tag`, never copied into a new issue.

## Fallback or wait

The maintainer prefers that work keeps moving: a decision names a fallback, the option you go ahead with if no answer comes, and a wait of 30 minutes to 24 hours (two hours when unstated). A decision waits instead, with `waits` giving the reason, when it confirms something already built or when a fallback would decide something the maintainer must see first. Three kinds of choice always wait, and the tool refuses a fallback on them; mark one with `alwaysWaits`:

- `deletes-work`: deleting or overwriting work that cannot be restored;
- `leaves-repository`: anything that leaves the repository (publishing, sending, spending);
- `waives-check`: waiving a failed check, such as merging despite a review flag.

A task has no fallback and no clock.

## Write the request

Write a JSON request file and put its pictures in one folder (by default the request file's folder). Start from `fixtures/decision.json` or `fixtures/task.json` beside the tool, which show every field.

- **Decision fields:** `question` (one sentence), `tickets`, `askedBy` (the run or session, in words), `owner` (the run or session identifier), `parked` (what waits on the answer), `meanwhile` (what carries on), `shortVersion` (one paragraph), optional `background`, `showsOnScreen`, `options` (each with `name`, `pictures` or `example`, `pros`, `cons`, `undo`), `comparison` (a list or a table of at most four columns), `recommendation` (`option` and `reason`), and `fallback` (`option`, optional `waitMinutes`) or `waits`.
- **Task fields:** `action` (one sentence), `tickets` (optional for `tag`), `askedBy`, `owner`, `why` (why only the maintainer can do it), `steps`, optional `expect`, `details` and `parked`.
- **Pictures:** each picture is a block `{ "file", "alt", "width" }`. `background`, `expect` and `details` take a string or a list of strings and picture blocks. Never type picture markup into text; the tool refuses it, since only a block can be uploaded and put in place.

Write for a reader who supervises the work but has not followed your session: plain English, no ticket number without saying what the ticket is, no labels you invented, and every option's Pros, Cons and cost to undo stated concretely. The short version must make sense on its own.

Pictures decide most requests. Capture each option at the same width and in the same theme, cropped to where the options differ, and at the maintainer's phone size for a phone question. Use fixture content only: an uploaded picture is readable by anyone who has its address. Use the editor or extension driver skill to capture them, and look at each picture before filing.

## File it

```sh
node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json> [<pictures-folder>] --dry-run
node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json> [<pictures-folder>]
node .agents/skills/ask-maintainer/maintainer-request.mjs tag <ticket> <task.json> [<pictures-folder>]
node .agents/skills/ask-maintainer/maintainer-request.mjs list
```

The dry run validates the request, checks for an open request asking the same question about the same ticket, and prints the body without filing. Correct every refusal it lists and run it again.

`file` creates the issue in one typed call with its label and assignee, uploads the pictures and writes each hosted address where the request places it, reads the body back, checks type, label, assignee, no parent and no milestone, then blocks every named ticket on the request. It prints the request's number, address and fallback time. When anything fails after the issue exists, the tool rolls back: it removes the dependencies it added and closes the issue as not planned with the reason, so the same request can be filed again once the cause is corrected.

`tag` gives an existing ticket the `maintainer: task` label, the assignee and one comment with the task's fields, blocks each ticket the task names on it, and creates no issue; when a step fails it deletes the comment and removes what it added. `list` prints the open requests in three groups (decisions, tasks, went ahead without you) with links, ages and fallback times; `list --json` prints the same data for a report.

Until the tool has its own identity, it files through the maintainer's account and says so at the end of every request.

## After filing

Give the request's number and address wherever you would have raised the question, and carry on with the work it does not hold up. The answer is given on the request: closing it with a comment is the decision in the maintainer's words, closing it with no comment accepts the recommendation, and a comment without closing is a question to answer with a reply on the request. Recording the answer, waiting for it and taking the fallback are not part of this tool yet; until they are, read the request yourself at each check-in.
