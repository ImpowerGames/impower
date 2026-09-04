#!/usr/bin/env bash
# PreToolUse hook body for Write|Edit. Denies edits to the generated grammar,
# config, and snippets JSON files — they are build artifacts of
# definitions/yaml/*.yaml and get overwritten by the definitions build.
#
# Reads the tool_input JSON payload from stdin. Uses node instead of jq so it
# still works on a checkout that has no jq installed, and matches on the
# filename alone (not a `*/language/...` prefix) so it still matches when
# tool_input.file_path arrives with backslashes, as it does on Windows.
set -u

payload=$(cat)

file_path=$(node -e '
let d = "";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  let p = "";
  try { p = JSON.parse(d).tool_input.file_path || ""; } catch (e) {}
  process.stdout.write(p);
});
' <<< "$payload")

case "$file_path" in
  *sparkdown.language-grammar.json|*sparkdown.language-config.json|*sparkdown.language-snippets.json)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This file is generated from a YAML source under definitions/yaml/ and is overwritten by the definitions build, which propagates to both packages/sparkdown/language/ and vscode-sparkdown/language/. Edit the matching YAML file instead, then regenerate both locations with: cd definitions && npm run language"}}'
    ;;
esac
