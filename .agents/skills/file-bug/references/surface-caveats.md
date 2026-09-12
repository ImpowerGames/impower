# Reproduction caveats

All commands run from the worktree root unless stated otherwise.

## Gotchas

This list holds only what no mechanism catches. A trap a command can catch belongs in the command: the preflight executes this worktree's `esbuild` and `vitest` rather than trusting the install, and a hook refuses an edit to a generated `language/*.json`. A rule that holds for the whole repository, such as the heredoc one, belongs in the repository's agent instructions.

- The colour of a loop can lie in either direction. A repro that only reproduces on a loaded machine is a timing artifact until proven otherwise; note it, and check whether a vitest suite from another worktree was running. An expectation inside a test file that already fails wholesale pins nothing: before treating it as coverage, run the whole file unmodified on `origin/main` with the capped single-file command, since several suites here are red for unrelated reasons; a file whose only failures there are the reported symptom is the repro you were looking for.
- A language-server surface that shows nothing is not yet a missing feature. A hover exists only on a reference to an image asset, so ask for it on a use of the image name rather than its definition; the drive-vscode-web driver's `--hover` lands on the first rendered line holding the word, and its `--line <text>` option picks a later one. The web-editor driver's `--complete line:col=text` types into the open script and reads the list and details; restore the script before repeating a run that needs its original text. In VS Code the completion details pane is collapsed by default, so check a completion preview in desktop VS Code, expanding the pane with Ctrl+Space while the list is open, before concluding that the preview is missing.
