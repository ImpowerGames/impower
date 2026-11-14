# Read, record and wait for the answer

All commands run from the repository root.

## The answer

Closing is the answer, and only the maintainer closes. The maintainer's words are their comments on the request since its last revision, up to the close; a comment the tool posted is never the maintainer's, even though it carries the maintainer's login.

- **Closed with a comment:** answered, in the maintainer's words. An answer that fits no option is acted on as written.
- **Closed with no comment:** the recommendation is accepted.
- **A comment without closing:** a question, or a statement of what is missing. The fallback clock stops; answer it with `revise`, which restarts the clock.
- **A task:** closed as completed means done; closed as not planned means the maintainer will not do it, so carry on without it and say what that leaves undone.
- **Unclear:** a decision closed as not planned with no comment, closed by another account, or closed before its latest revision. Reopen it with a question through `revise`.
- **An answer typed in chat** counts only through `answer-from-chat`, which accepts the quoted words only when they appear as one unbroken run in a message the maintainer typed in that session's transcript (below). A paraphrase, words an agent wrote, tool output and relayed or injected messages are refused.

Never write that the maintainer decided anything unless `record` has recorded it.

```sh
node .agents/skills/ask-maintainer/maintainer-request.mjs read <request> [--json]
node .agents/skills/ask-maintainer/maintainer-request.mjs record <request>
node .agents/skills/ask-maintainer/maintainer-request.mjs revise <request> <request.json> <what-changed.md> [<pictures-folder>]
node .agents/skills/ask-maintainer/maintainer-request.mjs withdraw <request> <reason>
node .agents/skills/ask-maintainer/maintainer-request.mjs answer-from-chat <request> <words-file> <transcript.jsonl> [--not-planned]
```

`read` reports the request's state: waiting, question, answered (with each comment's words, address and time), accepted, done, will-not-do, unclear or withdrawn. `record` posts one comment on each ticket the request holds up, copying from GitHub: the question and a link, the answer in the maintainer's words with a link and time (or "accepted the recommendation by closing without comment"), what was shown (the request as filed or last revised, with its option and picture counts) and the recommended option. It then confirms on the request that the record was made. Running it again posts nothing new unless the maintainer has since edited the words, which are then recorded again. Record every answer before acting on it.

`revise` replaces the request's body from a corrected request file (same kind, same tickets), posts what changed, restarts the fallback clock and, as its last step, reopens an unclear request; GitHub's edit history keeps the earlier body. A revision that fails deletes its note and restores the body and title, and never closes the request itself. `withdraw` closes a request you no longer need as not planned, with the reason. `answer-from-chat` posts the found words on the request, marked as relayed from chat with the session and time, closes it (as not planned with `--not-planned`, for a task the maintainer will not do) and records it. Put the words in a file exactly as the maintainer typed them. When a close fails, the tool deletes the note it posted for that close, so the note never reads as the reason for a later close.

A ticket held by a request stays blocked until the request closes; a closed request then counts as a met blocker for orchestrate-issues, whatever the answer.

## Session transcripts

- **Claude Code:** `~/.claude/projects/<project folder>/<session id>.jsonl`. A message the user typed has `turnOrigin` `human`.
- **Codex:** `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<timestamp>-<session id>.jsonl`. Text the user typed is a `user` message item whose provenance is `user`.

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
