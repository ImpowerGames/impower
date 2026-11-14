# Guards on maintainer requests

Two repository hooks hold these rules in every harness that runs the shared hooks.

A command that changes or publishes to the tickets repository is checked only in a plain form, and any other form is refused with the plain form to use:

- `gh issue` and `gh pr` subcommands with each flag and its value given separately (no `-wb`, no `-R<repo>`);
- `gh api` with separate flags and one `-X` or `--method`;
- one curl transfer: separate flags, one URL, no `--next`;
- `Invoke-RestMethod` and `Invoke-WebRequest` with full parameter names and separate values (no `-Me`, no `-Uri:<url>`).

A command counts as changing when it names a method other than GET or HEAD, or names none and sends data or a body. A changing `gh api`, curl or PowerShell call must use only the options the guard reads (method, headers, data or body, output and timing flags). Curl uploads, forms, config files, `--request-target`, variable expansion and proxies, and PowerShell forms, are refused there even on an apparent read, since they can carry a method, body or destination the guard cannot see. Reads, including an explicit `-X GET`, and commands aimed at other repositories are not limited this way.

A `gh issue` comment, edit, close or reopen, or a REST call that changes an issue, is refused on a number the tool knows as a request, and the refusal names the tool command to use instead. Issue, pull request and comment text that claims a maintainer decision is refused unless it cites a request whose answer `read` or `record` has seen; quoting an existing record in a blockquote or in quotation marks passes. A bare `#N` cites a request only in text published to the tickets repository; anywhere else, such as a pull request body, cite it as `<owner>/<repo>#N`, the autolink form `I-N` or its address. Only text sent to GitHub is checked, and a JSON or form request body is read for its `body` and `title`. A relative body file is read in every directory the command may be in after a literal `cd`, `pushd` or `popd`, so a claim in any of them refuses the command. When an agent went ahead because no answer came, write "decided by fallback" instead of naming the maintainer.

The hooks read the request index the tool keeps on this machine (`impower/maintainer-requests` under `%LOCALAPPDATA%`, or elsewhere under `$XDG_STATE_HOME` or `~/.local/state`): `file`, `tag`, `read`, `record`, `revise`, `withdraw`, `wait` and `answer-from-chat` add or update the requests they touch, and `list` adds every request in GitHub, open or closed, and forgets a tagged ticket whose `maintainer: task` label was removed. When the index cannot be read the hooks refuse the command and say to run `list`. Like the typed-issue hook, they read command text only, so an issue number, directory or body built from a shell variable or read from standard input (such as `xargs`), or a call made from a wrapper script, is outside what they see.
