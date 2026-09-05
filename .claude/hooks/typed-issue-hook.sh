#!/usr/bin/env bash
# PreToolUse hook for the Bash and PowerShell tools: refuses any command
# that would create a GitHub issue without an issue type.
#
# Every ticket in this repo carries one of Bug, Feature, or Task. `gh issue
# create` cannot set a type, so it is refused outright; the REST create
# endpoint can, so a `gh api` POST to an issues collection is allowed only
# when it carries a `type=` field. Everything else passes through untouched.
#
# The payload arrives on stdin as JSON with the command under
# tool_input.command. The checks are plain substring matches on that JSON,
# lowercased, so the hook needs no jq or node. A command that merely mentions
# the phrase `gh issue create` (a grep for it, say) is refused too; the
# deny reason says so, and the Grep tool is the way to search for it.
#
# Exercised by typed-issue-hook.test.sh next to this file.

payload=$(cat)
lc=$(printf '%s' "$payload" | tr 'A-Z' 'a-z')

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$1"
  exit 0
}

recipe='gh api -X POST repos/ImpowerGames/impower/issues -f title=<title> -F body=@ticket.md -f type=Bug -f labels[]=<label>   (type is Bug, Feature, or Task)'

case "$lc" in
  *"gh issue create"*)
    deny "gh issue create cannot set an issue type, and every ticket here carries one (Bug, Feature, or Task). Create the issue with one typed REST call instead: $recipe. If this command only mentions the phrase, search with the Grep tool rather than a shell command."
    ;;
esac

# A `gh api` POST whose endpoint is an issues collection: `.../issues` at the
# end of the argument, before a space, a query string, or a closing quote
# (`\"` is a quote inside the JSON-encoded command; a bare `"` ends it).
# `/issues/<number>/...` endpoints are comments, labels, and edits, and pass.
case "$lc" in
  *"gh api"*)
    case "$lc" in
      *"-x post"*|*"-xpost"*|*"--method post"*|*"--method=post"*)
        case "$lc" in
          *'/issues '*|*'/issues?'*|*'/issues"'*|*'/issues\"'*|*"/issues'"*)
            case "$lc" in
              *"type="*) ;;
              *) deny "This creates an issue without an issue type, and every ticket here carries one (Bug, Feature, or Task). Add -f type=Bug, -f type=Feature, or -f type=Task to the same call: $recipe" ;;
            esac
            ;;
        esac
        ;;
    esac
    ;;
esac

exit 0
