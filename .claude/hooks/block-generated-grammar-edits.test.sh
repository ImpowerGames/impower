#!/usr/bin/env bash
# Exercises block-generated-grammar-edits.sh directly so a silent pass (the
# hook matching nothing and letting the edit through) is caught instead of
# trusted. Run: bash .claude/hooks/block-generated-grammar-edits.test.sh
set -u

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hook="$dir/block-generated-grammar-edits.sh"

fail=0

make_payload() {
  node -e 'process.stdout.write(JSON.stringify({tool_input:{file_path: process.argv[1]}}))' "$1"
}

assert_denies() {
  local desc="$1" path="$2" out
  out=$(make_payload "$path" | bash "$hook")
  if [[ "$out" == *'"permissionDecision":"deny"'* ]]; then
    echo "PASS (denied): $desc"
  else
    echo "FAIL (expected deny): $desc -- got: '$out'"
    fail=1
  fi
}

assert_allows() {
  local desc="$1" path="$2" out
  out=$(make_payload "$path" | bash "$hook")
  if [[ -z "$out" ]]; then
    echo "PASS (allowed): $desc"
  else
    echo "FAIL (expected no output): $desc -- got: '$out'"
    fail=1
  fi
}

assert_denies "forward-slash grammar path"     "packages/sparkdown/language/sparkdown.language-grammar.json"
assert_denies "forward-slash config path"      "vscode-sparkdown/language/sparkdown.language-config.json"
assert_denies "forward-slash snippets path"    "packages/sparkdown/language/sparkdown.language-snippets.json"
assert_denies "Windows backslash grammar path" 'C:\Users\dev\impower\packages\sparkdown\language\sparkdown.language-grammar.json'
assert_denies "Windows backslash config path"  'C:\Users\dev\impower\vscode-sparkdown\language\sparkdown.language-config.json'

assert_allows "unrelated source file"             "packages/sparkdown/src/compiler/utils/filterImage.ts"
assert_allows "similarly-named but distinct file" "packages/sparkdown/language/sparkdown.language-grammar.json.bak"
assert_allows "empty file_path"                   ""

if [[ "$fail" -ne 0 ]]; then
  echo "One or more hook assertions failed."
  exit 1
fi

echo "All hook assertions passed."
