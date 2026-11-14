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
- **Pictures:** each picture is a block `{ "file", "alt", "width" }`, its file named with letters, digits, `.`, `_`, `-` and `/` only. `background`, `expect` and `details` take a string or a list of strings and picture blocks. Never type picture markup into text; the tool refuses it, since only a block can be uploaded and put in place.

Write for a reader who supervises the work but has not followed your session: plain English, no ticket number without saying what the ticket is, no labels you invented, and every option's Pros, Cons and cost to undo stated concretely. The short version must make sense on its own.

Pictures decide most requests. Capture each option at the same width and in the same theme, cropped to where the options differ, and at the maintainer's phone size for a phone question. Use fixture content only: an uploaded picture is readable by anyone who has its address. Use the editor or extension driver skill to capture them, and look at each picture before filing.

## File it

```sh
node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json> [<pictures-folder>] --dry-run
node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json> [<pictures-folder>]
node .agents/skills/ask-maintainer/maintainer-request.mjs tag <ticket> <task.json> [<pictures-folder>]
node .agents/skills/ask-maintainer/maintainer-request.mjs list
node .agents/skills/ask-maintainer/maintainer-request.mjs identity
```

The dry run validates the request, checks for an open request asking the same question about the same ticket, and prints the body without filing. Correct every refusal it lists and run it again.

`file` creates the issue in one typed call with its label and assignee, uploads the pictures and writes each hosted address where the request places it, reads the body back, checks type, label, assignee, no parent and no milestone, then blocks every named ticket on the request. It prints the request's number, address and fallback time. When anything fails after the issue exists, the tool rolls back: it removes the dependencies it added and closes the issue as not planned with the reason, so the same request can be filed again once the cause is corrected. When two sessions file the same request at once, the earliest issue stands and the later one withdraws itself and names it.

`tag` gives an existing ticket the `maintainer: task` label, the assignee and one comment with the task's fields, blocks each ticket the task names on it, and creates no issue; when a step fails it deletes the comment and removes what it added. It refuses a ticket that already has a task comment; when that ticket's tag was removed on purpose, delete the old comment and tag again. `list` prints the open requests in three groups (decisions, tasks, went ahead without you) with links, ages and fallback times; `list --json` prints the same data for a report.

## Who the tool acts as

The tool acts on GitHub as its own GitHub App, so GitHub alerts the maintainer when a request is assigned and their answers can be told apart from the tool's. Every command signs a short-lived token for the App's installation and uses it for every call it makes: filing, editing, labels, assignment, dependencies and comments. The token covers read and write access to issues on the tickets repository and nothing else. The App's slug, App id and installation id are `maintainer.app` in `.agents/repos.json`, all `null` until the App exists. Its private key stays outside every repository; the environment variable `ASK_MAINTAINER_APP_KEY` holds the key file's absolute path.

The tool refuses to run when `ASK_MAINTAINER_APP_KEY` is set but names an unreadable file, a file that is not an RSA private key in PEM form, a relative path, or a file inside a Git work tree. The error names the variable and never quotes the key.

On a machine without the key (the variable unset), with no App configured, or when GitHub refuses the token request or cannot be reached, the tool files through the maintainer's own account and says why in its output. Each request then ends with a visible line saying an agent filed it through the maintainer's account and that GitHub sends no alert for it. Each comment the tool posts carries a visible line saying the tool posted it.

The tool marks every body and comment it writes with the hidden line `<!-- ask-maintainer: posted by the tool -->`. `commentAuthor` and `actorOf` in `github-app.mjs` decide whose a comment or close is, and the rule is the same with or without the App. A comment or close by the App is the tool's. A maintainer-login comment that carries the mark on a line of its own is also the tool's. Any other comment or close by the maintainer's login is the maintainer's. Code that reads answers uses these functions rather than comparing logins itself.

### Set up the App

The maintainer does this once, then saves the key on each machine that runs agents:

1. Create a GitHub App owned by the ImpowerGames organization, with no webhook, no callback URL, and one repository permission: Issues, read and write.
2. Install it on the tickets repository only.
3. Put its slug (from its `github.com/apps/<slug>` address), its App id (from its settings page) and its installation id (the number at the end of the installation's settings address) in `maintainer.app` in `.agents/repos.json`.
4. Generate a private key from the App's settings page, save it outside every repository, and set `ASK_MAINTAINER_APP_KEY` to the key file's absolute path in the environment agents start with.
5. Run `node .agents/skills/ask-maintainer/maintainer-request.mjs identity`. With the key in place it prints `Acting as the GitHub App <slug>[bot].`; otherwise it gives the reason it acts through the maintainer's account.

## After filing

Give the request's number and address wherever you would have raised the question, and carry on with the work it does not hold up. The answer is given on the request: closing it with a comment is the decision in the maintainer's words, closing it with no comment accepts the recommendation, and a comment without closing is a question to answer with a reply on the request. Recording the answer, waiting for it and taking the fallback are not part of this tool yet; until they are, read the request yourself at each check-in.
