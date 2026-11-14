# Go ahead without the maintainer

All commands run from the repository root.

```sh
node .agents/skills/ask-maintainer/maintainer-request.mjs fallback <request> <owner> <what-it-is-doing.md>
```

When a decision's fallback time passes with no answer and no open question, the run or session that owns it goes ahead the next time it is awake; no other session does. `wait` returns at that time. Each step:

1. **Go ahead.** Write one paragraph saying what you are doing with the fallback option in a file, then run `fallback`, with `<owner>` exactly as the request's `owner` field. The tool reads the request again and refuses before the fallback time, while a maintainer question is open, on a request that waits, on a task, on a closed request, on one that already went ahead, and for another owner. Otherwise it posts on the request what you are going ahead with and what undoing it costs, adds `maintainer: decided without you`, leaves the request open, and records on each ticket the request holds up "Decided by fallback, not reviewed by the maintainer", naming the option and how long the request went unanswered. It posts the request comment last: when a step fails it deletes what it posted and removes the label, and running `fallback` again after a run that stopped part-way reuses the records already posted and completes it. The tickets the request held up are no longer held, by orchestrate-issues or at its merge gate, so carry on with the fallback option.
2. **Keep watching.** The request stays in the maintainer's "went ahead without you" list until they close it. `read` reports it as went-ahead, and `wait` keeps watching it. `withdraw` refuses it: only the maintainer closes it. A comment without closing is a question, answered with `revise`, which keeps the fallback in place.
3. **Kept:** closed with no comment. `record` adds "Kept by the maintainer" to each ticket; nothing changes.
4. **Changed:** closed with a comment. `record` adds the change as a decision in the maintainer's words. Then undo the fallback and act on those words.

A request closed as not planned with no comment is unclear, as for any decision: reopen it with a question through `revise`.

Never write that the maintainer decided, kept or changed anything before `record` has recorded it; a fallback record is never the maintainer's decision.
