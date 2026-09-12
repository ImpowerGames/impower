# Interview format and design decisions

All commands run from the worktree root unless stated otherwise.

## 3. The interview

The technique is adapted from Matt Pocock's grilling skill (github.com/mattpocock/skills, MIT). Treat the design as a tree: every decision branches into the decisions that hang off it. The frontier is the set of decisions whose prerequisites are settled, the ones you can ask now without guessing at answers you have not heard. Ask the whole frontier in one round, numbered, each with your recommended answer, then wait. A question whose answer depends on another question still open in this round belongs to the next round.

Format each round like this:

```
❓ Q1 - <question title>: <question body, with the options where there are options>

➡️ <your recommended answer, and why in one sentence>

---

❓ Q2 - <question title>: ...

➡️ ...
```

Recommend on every question. The user came with an idea, not a spec, and a recommendation they can accept or reject in a word moves faster than an open question. Ground the recommendation in what you found in steps 1 and 2: "the `load` arrow already does X, and Ren'Py and Godot both treat it as Y, so I recommend Y". When a question is about how a design behaves on real data, a throwaway prototype run against that data answers it better than a recommendation; put the run's results into Alternatives considered.

Each answered round reshapes the tree. Recompute the frontier and ask the next round. The interview is done when the frontier is empty: every branch visited, nothing left silently assumed. Do not file until the user confirms the understanding is shared. If the user says "just decide" on a branch, take your recommendation and mark the decision "decided by default" in the ticket so a later reader knows it was not chosen deliberately.

Branches that nearly always exist for a feature here, in the order they usually unblock each other:

1. The author's problem. What they are trying to do in a script or in the editor, and what stops them today. Settle this before any surface question; a solution to the wrong problem is the most expensive outcome.
2. The author surface. The syntax, directive, define type, editor control, or extension command. Show a concrete example script. Existing conventions constrain this: directives are `[[name args]]`, arrows are `->` forms, defines are `define <type> <name>` blocks; a new surface that ignores them costs a grammar change in `definitions/yaml/` plus both regenerated JSON copies.
3. Semantics and edge cases. What happens at scene boundaries, inside tunnels and threads, on a checkpoint restore, on a save and load, when the asset or target is missing, when the same thing is invoked twice. The prior art from step 2 is the checklist here: every case a peer system handles explicitly is a case to decide.
4. Preview versus play. The editor preview is scrub-driven and time-free; play is time-driven. Most features behave differently in each (timed assets load only in play, the loading screen is a no-op in preview) and the difference has to be decided, not discovered.
5. Which surfaces ship it. Web editor, VS Code extension, standalone player, or all three. The compile runs in each, so a compiler change lands everywhere; an editor-only feature does not.
6. What is reused. The existing code, branch, or prior ticket that partly covers it, and whether it is extended or replaced.
7. Tests. Which seam proves it works: a compiler test on the program output, an engine test on module behavior, a player DOM test, a live check in the running editor. Prefer the highest existing seam; new seams are a cost. The write-regression-test skill lists where each package's tests live and which packages have none, and the drive-web-editor skill is what a live check in the editor can and cannot see; name the seam in the ticket in those terms, because they are the steps the implementer runs.
8. Scope edges. What is deliberately left out, and whether the work is one pull request or several. A ticket sized to one fresh context window is one resolve-issue run; larger than that, split it (section 4).

Not every feature has all eight, and some have branches this list does not. The list is a checklist against silent assumptions, not a script.
