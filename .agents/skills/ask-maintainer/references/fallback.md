# Go ahead without the maintainer

All commands run from the repository root.

```sh
node .agents/skills/ask-maintainer/maintainer-request.mjs fallback <request> <owner> <what-it-is-doing.md>
```

When a decision's fallback time passes with no answer and no open question, the run or session that owns it goes ahead the next time it is awake; no other session does. `wait` returns at that time. Each step:

1. **Go ahead.** Write one paragraph saying what you are doing with the fallback option in a file, then run `fallback`, with `<owner>` exactly as the request's `owner` field. The tool reads the request again and refuses before the fallback time, while a maintainer question is open, on a request that waits, on a task, on a closed request, on one that already went ahead, and for another owner. Otherwise it commits the fallback in one edit of the request: the body's first line becomes "I went ahead with …", its data line gains the went-ahead marker, and `maintainer: decided without you` is added, all together. The request stays open. Then it posts on the request what you are doing and what undoing it costs, and records on each ticket the request holds up "Decided by fallback, not reviewed by the maintainer", naming the option and how long the request went unanswered; these are history, not the signal. The tickets the request held up are no longer held, by orchestrate-issues or at its merge gate, so carry on with the fallback option.
2. **Keep watching.** The request stays in the maintainer's "went ahead without you" list until they close it. `read` reports it as went-ahead, and `wait` keeps watching it. `withdraw` refuses it: only the maintainer closes it. A comment without closing is a question, answered with `revise`, which keeps the fallback in place.
3. **Kept:** closed with no comment. `record` adds "Kept by the maintainer" to each ticket; nothing changes.
4. **Changed:** closed with a comment. `record` adds the change as a decision in the maintainer's words. Then undo the fallback and act on those words.

## When the commit counts

Every reader (`read`, `record`, `withdraw`, `fallback`, the orchestrate-issues planner and its merge gate) applies one rule. The marker counts only while the request carries the label and the edit that added it, the latest `labeled` event in the timeline, was made while the request was open, with no maintainer comment since the last revision before it, and with no revision before it naming another fallback time. A maintainer comment or close after that edit is a question on, or an answer to, a fallback that stands.

`fallback` reads the request once more after its edit. If the commit does not count, because the maintainer commented, closed or a revision landed just before it, it takes the marker and the label back out in one edit, restoring the body, and posts nothing. If it stopped between the edit and the note, your next `fallback` posts the missing note and records, and `record` completes them before adding its own record. A marker that does not count, left by a run that stopped, is ignored by every reader; your next `fallback` (even one refused for an open question) or `withdraw` takes it out.

A request closed as not planned with no comment is unclear, as for any decision, and so is one closed with no comment after a marker that does not count: reopen it with a question through `revise`, which replaces the marker.

Never write that the maintainer decided, kept or changed anything before `record` has recorded it; a fallback record is never the maintainer's decision.
