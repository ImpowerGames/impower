---
name: ask-maintainer
description: File a maintainer decision or maintainer task as a GitHub issue through a tool that refuses an incomplete request, uploads its pictures into place and blocks the tickets it holds up, then reads, records and waits for the maintainer's answer in their own words. Use wherever a coordinator or stand-alone session would otherwise stop or hold work for the maintainer; a writer under a coordinator asks its coordinator instead.
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
- **Pictures:** each picture is a block `{ "file", "alt", "width" }`, its file named with letters, digits, `.`, `_`, `-` and `/` only. `background`, `expect` and `details` take a string or a list of strings and picture blocks. Never type picture markup into text; the tool refuses it, since only a block can be uploaded and put in place.

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

`file` creates the issue in one typed call with its label and assignee, uploads the pictures and writes each hosted address where the request places it, reads the body back, checks type, label, assignee, no parent and no milestone, then blocks every named ticket on the request. It prints the request's number, address and fallback time. When anything fails after the issue exists, the tool rolls back: it removes the dependencies it added and closes the issue as not planned with the reason, so the same request can be filed again once the cause is corrected. When two sessions file the same request at once, the earliest issue stands and the later one withdraws itself and names it.

`tag` gives an existing ticket the `maintainer: task` label, the assignee and one comment with the task's fields, blocks each ticket the task names on it, and creates no issue; when a step fails it deletes the comment and removes what it added. It refuses a ticket that already has a task comment; when that ticket's tag was removed on purpose, delete the old comment and tag again. `list` prints the open requests in three groups (decisions, tasks, went ahead without you) with links, ages and fallback times; `list --json` prints the same data for a report.

Until the tool has its own identity, it files through the maintainer's account and says so at the end of every request.

## After filing

Give the request's number and address wherever you would have raised the question, and carry on with the work it does not hold up. Never comment on, edit, close or reopen a request yourself; every change goes through the tool, which marks its own comments so they are never mistaken for the maintainer's.

## The answer

Closing is the answer, and only the maintainer closes. The maintainer's words are their comments on the request since its last revision, up to the close; a comment the tool posted is never the maintainer's, even though it carries the maintainer's login.

- **Closed with a comment:** answered, in the maintainer's words. An answer that fits no option is acted on as written.
- **Closed with no comment:** the recommendation is accepted.
- **A comment without closing:** a question, or a statement of what is missing. The fallback clock stops; answer it with `revise`, which restarts the clock.
- **A task:** closed as completed means done; closed as not planned means the maintainer will not do it, so carry on without it and say what that leaves undone.
- **Unclear:** a decision closed as not planned with no comment, or closed by another account. Reopen it with a question through `revise`.
- **An answer typed in chat** counts only through `answer-from-chat`, which accepts the quoted words only when they appear as one unbroken run in a message the maintainer typed in that session's transcript ([runner notes](../RUNNERS.md) say where each runner keeps it). A paraphrase, words an agent wrote, tool output and relayed or injected messages are refused.

Never write that the maintainer decided anything unless `record` has recorded it.

```sh
node .agents/skills/ask-maintainer/maintainer-request.mjs read <request> [--json]
node .agents/skills/ask-maintainer/maintainer-request.mjs record <request>
node .agents/skills/ask-maintainer/maintainer-request.mjs revise <request> <request.json> <what-changed.md> [<pictures-folder>]
node .agents/skills/ask-maintainer/maintainer-request.mjs withdraw <request> <reason>
node .agents/skills/ask-maintainer/maintainer-request.mjs answer-from-chat <request> <words-file> <transcript.jsonl> [--not-planned]
```

`read` reports the request's state: waiting, question, answered (with each comment's words, address and time), accepted, done, will-not-do, unclear or withdrawn. `record` posts one comment on each ticket the request holds up, copying from GitHub: the question and a link, the answer in the maintainer's words with a link and time (or "accepted the recommendation by closing without comment"), what was shown (the request as filed or last revised, with its option and picture counts) and the recommended option. It then confirms on the request that the record was made; running it again posts nothing new. Record every answer before acting on it.

`revise` replaces the request's body from a corrected request file (same kind, same tickets), posts what changed, restarts the fallback clock and reopens an unclear request; GitHub's edit history keeps the earlier body. `withdraw` closes a request you no longer need as not planned, with the reason. `answer-from-chat` posts the found words on the request, marked as relayed from chat with the session and time, closes it (as not planned with `--not-planned`, for a task the maintainer will not do) and records it. Put the words in a file exactly as the maintainer typed them.

A ticket held by a request stays blocked until the request closes; a closed request then counts as a met blocker for orchestrate-issues, whatever the answer.

## Wait for the answer

GitHub does not notify a session. `wait` returns when any request it names is closed, gets a new maintainer comment, or reaches its fallback time with no question open, and prints which:

```sh
node .agents/skills/ask-maintainer/maintainer-request.mjs wait <request> [<request> ...] [--interval=<seconds>]
```

It reads each request once a minute (`--interval` may lengthen that, never shorten it) with a conditional request, which costs nothing while the request is unchanged, and prints the seconds between a close and its return.

How a session is woken:

- **Claude Code:** run `wait` as a background command. The session is woken when it returns, after which you `read` and `record` the answer. Measured: `wait` returned 32 seconds after the close, and the session received the finished command's notice at once.
- **Codex:** a finished background command does not wake the session, so run `wait` in the foreground of the turn with a shell timeout longer than the wait you expect, or read the request at the next check-in. Measured with codex-cli 0.166.0 `codex exec`: a foreground `wait` returned 31 seconds after the close and the session went on to `record`; a background command that finished 56 seconds after the turn ended started no new turn. The Codex desktop app was not measured.
- **Anywhere else, or after the session ends:** the answer stays on the request. Read it at the next check-in, or the next session on the ticket reads it, since the ticket stays blocked until the request closes.
