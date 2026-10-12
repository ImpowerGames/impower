# Writer reports and requests

Messages between the coordinator and its writers are hints: they can queue, arrive late, be cut short or be lost. GitHub (issues, PR heads, review comments, CI) and each writer's own transcript are the authorities, so every decision rests on them, not on a message alone.

## Read a writer's report in full

A note that a writer ended its turn, or a message relaying its report, may be a fixed-length excerpt: treat it as a pointer to the report, never the report itself. A report is complete only when it names the model and effort the writer read itself, the PR, the last independently reviewed commit, the rounds used per reviewer route, the outstanding findings (or None), the verification, the state of each CI check on the final head, and the writer's next action. When a note lacks any of these, read the end of that writer's transcript, as the [writing routes](../../references/runner-writing.md) describe for its route, before deciding anything, and confirm the PR facts on GitHub. Store the full report with `result`.

## After the coordinator restarts

On the first wake after the coordinator itself restarted, or resumed from a summary, list every writer the record holds, observe each, and read the last turn of every one that is idle: a request a writer sent while the coordinator was not running is otherwise lost. Then plan as usual.

## Record each request and its answer

When a writer asks for a decision (another review round, a design question, a blocker), record it with `request --ticket N --text "<the request>" --source "<where it was read>"`, which prints its id. The request belongs to the writer that asked it: it closes when that writer is released, and a new writer asks its own. The plan shows the ticket as `answer-request` until the answer has been delivered. A request passed to the maintainer is recorded with `relay --ticket N --request <id> --to "the maintainer"` and stays open while they decide.

An answer is a message, so it follows the same steps as a brief. `answer --ticket N --request <id> --text "<the answer>"` records the intent and prints the message to send; send it exactly as printed, then record `answered --ticket N --request <id>`. Each copy names the request and its delivery, and tells the writer to ignore a copy once one has arrived. If the coordinator stops between the two records, the answer may still be queued: when the writer's transcript shows it, record `answered` with that evidence; otherwise wait, or resend with `answer --retry`, which prints the same answer with a new delivery id. Never record a new answer over an unconfirmed one.

The brief to a newly launched adopted writer works the same way with `deliver`, `delivered` and `deliver --retry`; every copy names the assignment. An existing writer adopted with its work already has its assignment and is not briefed again.

Writers do not post a separate protocol of PR comments for these exchanges; their normal review comments stay on the PR.
