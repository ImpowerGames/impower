#!/usr/bin/env bash
# Extracts the literal PreToolUse "command" string for the Write|Edit hook
# from .claude/settings.json and exercises it directly, so this test can
# never drift from what actually ships. Run:
#   bash .claude/hooks/grammar-edit-hook.test.sh
#
# Node is only used here, by the test harness, to read settings.json and to
# build JSON payloads. The hook command itself has no interpreter dependency
# (no jq, no node) -- that is the point of the fix this test pins: the old
# command piped stdin through jq, which is not installed on every checkout,
# so on a machine without jq the hook silently matched nothing and let the
# edit through instead of denying it.
set -u

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
settings="$dir/.claude/settings.json"

CMD=$(node -e '
const d = require("fs").readFileSync(process.argv[1], "utf8");
process.stdout.write(JSON.parse(d).hooks.PreToolUse[0].hooks[0].command);
' "$settings")

fail=0

make_payload() {
  node -e 'process.stdout.write(JSON.stringify({tool_input:{file_path: process.argv[1]}}))' "$1"
}

# Both assertions check exit status and stderr too, not just stdout -- a
# hook that crashed also produces empty stdout, which must not read as a
# clean "allow".
assert_denies() {
  local desc="$1" path="$2" out rc err errfile
  errfile=$(mktemp)
  out=$(make_payload "$path" | bash -c "$CMD" 2>"$errfile")
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
  local desc="$1" path="$2" out rc err errfile
  errfile=$(mktemp)
  out=$(make_payload "$path" | bash -c "$CMD" 2>"$errfile")
  rc=$?
  err=$(cat "$errfile"); rm -f "$errfile"
  if [[ $rc -eq 0 && -z "$err" && -z "$out" ]]; then
    echo "PASS (allowed): $desc"
  else
    echo "FAIL (expected a clean allow, i.e. no output and no error): $desc -- rc=$rc stderr='$err' out='$out'"
    fail=1
  fi
}

assert_denies "forward-slash grammar path"     "packages/sparkdown/language/sparkdown.language-grammar.json"
assert_denies "forward-slash config path"      "vscode-sparkdown/language/sparkdown.language-config.json"
assert_denies "forward-slash snippets path"    "packages/sparkdown/language/sparkdown.language-snippets.json"
assert_denies "Windows backslash grammar path" 'C:\Users\dev\impower\packages\sparkdown\language\sparkdown.language-grammar.json'
assert_denies "Windows backslash config path"  'C:\Users\dev\impower\vscode-sparkdown\language\sparkdown.language-config.json'
assert_denies "uppercase Windows path"         'C:\USERS\DEV\PACKAGES\SPARKDOWN\LANGUAGE\SPARKDOWN.LANGUAGE-GRAMMAR.JSON'
assert_denies "mixed-case filename"            "packages/sparkdown/language/Sparkdown.Language-Grammar.json"

assert_allows "unrelated source file"              "packages/sparkdown/src/compiler/utils/filterImage.ts"
assert_allows "same filename outside a language dir" "docs/examples/my-sparkdown.language-grammar.json"
assert_allows "similarly-named but distinct file"  "packages/sparkdown/language/sparkdown.language-grammar.json.bak"
assert_allows "empty file_path"                    ""

if [[ "$fail" -ne 0 ]]; then
  echo "One or more hook assertions failed."
  exit 1
fi

echo "All hook assertions passed."
