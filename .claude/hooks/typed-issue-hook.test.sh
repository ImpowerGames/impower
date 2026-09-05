#!/usr/bin/env bash
# Exercises the typed-issue hook the way Claude Code runs it: the literal
# PreToolUse "command" string for the Bash|PowerShell matcher is read out of
# .claude/settings.json and executed with CLAUDE_PROJECT_DIR set, so the test
# covers the wiring in settings.json as well as the script it points at. Run:
#   bash .claude/hooks/typed-issue-hook.test.sh
#
# Node is only used by this harness, to read settings.json and to build JSON
# payloads; the hook itself has no interpreter dependency.
set -u

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
settings="$dir/.claude/settings.json"
export CLAUDE_PROJECT_DIR="$dir"

CMD=$(node -e '
const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const entry = (d.hooks?.PreToolUse ?? []).find(
  (e) => /\bBash\b/.test(e.matcher) && /\bPowerShell\b/.test(e.matcher)
);
if (!entry) { console.error("settings.json has no PreToolUse hook matching both Bash and PowerShell"); process.exit(1); }
const hook = entry.hooks.find((h) => h.command.includes("typed-issue-hook.sh"));
if (!hook) { console.error("the Bash|PowerShell PreToolUse hook does not run typed-issue-hook.sh"); process.exit(1); }
process.stdout.write(hook.command);
' "$settings") || { echo "FAIL: $CMD"; exit 1; }

fail=0

make_payload() {
  node -e 'process.stdout.write(JSON.stringify({tool_name: process.argv[1], tool_input:{command: process.argv[2]}}))' "$1" "$2"
}

# Both assertions check exit status and stderr too, not just stdout: a hook
# that crashed also produces empty stdout, which must not read as a clean
# "allow".
assert_denies() {
  local desc="$1" command="$2" out rc err errfile
  errfile=$(mktemp)
  out=$(make_payload Bash "$command" | bash -c "$CMD" 2>"$errfile")
  rc=$?
  err=$(cat "$errfile"); rm -f "$errfile"
  if [[ $rc -eq 0 && -z "$err" && "$out" == *'"permissionDecision":"deny"'* ]]; then
    echo "PASS (denied): $desc"
  else
    echo "FAIL (expected a clean deny): $desc -- rc=$rc stderr='$err' out='$out'"
    fail=1
  fi
}

assert_allows() {
  local desc="$1" command="$2" out rc err errfile
  errfile=$(mktemp)
  out=$(make_payload Bash "$command" | bash -c "$CMD" 2>"$errfile")
  rc=$?
  err=$(cat "$errfile"); rm -f "$errfile"
  if [[ $rc -eq 0 && -z "$err" && -z "$out" ]]; then
    echo "PASS (allowed): $desc"
  else
    echo "FAIL (expected a clean allow, i.e. no output and no error): $desc -- rc=$rc stderr='$err' out='$out'"
    fail=1
  fi
}

# The deny reason has to survive being parsed as JSON by the harness.
assert_deny_is_valid_json() {
  local desc="$1" command="$2" out
  out=$(make_payload Bash "$command" | bash -c "$CMD" 2>/dev/null)
  if printf '%s' "$out" | node -e '
    const o = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const r = o.hookSpecificOutput.permissionDecisionReason;
    if (typeof r !== "string" || !r.includes("type=")) process.exit(1);
  '; then
    echo "PASS (valid JSON deny with a recipe): $desc"
  else
    echo "FAIL (deny output is not valid JSON, or names no type= recipe): $desc -- out='$out'"
    fail=1
  fi
}

assert_denies "plain gh issue create" \
  'gh issue create --title "x" --body-file ticket.md --label "system: sparkdown"'
assert_denies "gh issue create after a cd" \
  'cd "C:/Users/dev/scratch" && gh issue create --title "x" --body-file ticket.md'
assert_denies "gh issue create in mixed case" \
  'GH issue Create --title "x"'
assert_denies "untyped REST create, unquoted endpoint" \
  'gh api -X POST repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md'
assert_denies "untyped REST create, quoted endpoint" \
  'gh api -X POST "repos/ImpowerGames/impower/issues" -f title="x"'
assert_denies "untyped REST create, endpoint last" \
  'gh api --method POST -f title=x repos/ImpowerGames/impower/issues'
assert_denies "untyped REST create, --method=POST with a query string" \
  'gh api --method=POST repos/ImpowerGames/impower/issues?foo=1 -f title=x'
assert_denies "untyped REST create, -XPOST" \
  'gh api -XPOST /repos/ImpowerGames/impower/issues -f title=x'
assert_denies "untyped REST create, lowercase post" \
  'gh api -X post repos/ImpowerGames/impower/issues -f title=x'

assert_deny_is_valid_json "gh issue create" 'gh issue create --title x'
assert_deny_is_valid_json "untyped REST create" 'gh api -X POST repos/ImpowerGames/impower/issues -f title=x'

assert_allows "typed REST create" \
  'gh api -X POST repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md -f type=Task -f "labels[]=workflow: ci"'
assert_allows "typed REST create with --field" \
  'gh api --method POST repos/ImpowerGames/impower/issues --field title=x --field type=Bug'
assert_allows "typed REST create, type quoted" \
  'gh api -X POST repos/ImpowerGames/impower/issues -f "type=Feature" -f title=x'
assert_allows "reading an issue" \
  'gh issue view 443 --json title,body,labels'
assert_allows "editing an issue" \
  'gh issue edit 443 --body-file ticket.md'
assert_allows "listing issues" \
  'gh issue list --label "workflow: ci"'
assert_allows "GET on the issues collection" \
  'gh api repos/ImpowerGames/impower/issues?state=open'
assert_allows "GET on the issues collection with an explicit method" \
  'gh api -X GET repos/ImpowerGames/impower/issues'
assert_allows "PATCH on one issue" \
  'gh api -X PATCH repos/ImpowerGames/impower/issues/443 -f type=Task'
assert_allows "POST of a comment on one issue" \
  'gh api -X POST repos/ImpowerGames/impower/issues/443/comments -f body=hi'
assert_allows "POST of labels on one issue" \
  'gh api -X POST repos/ImpowerGames/impower/issues/443/labels -f "labels[]=bug"'
assert_allows "pull request create" \
  'gh pr create --draft --title "x" --body-file pr-body.md'
assert_allows "pull request comment" \
  'gh pr comment 444 --body-file review.md'
assert_allows "unrelated command" \
  'npm run web:dev'
assert_allows "empty command" \
  ''

if [[ "$fail" -ne 0 ]]; then
  echo "One or more hook assertions failed."
  exit 1
fi

echo "All hook assertions passed."
