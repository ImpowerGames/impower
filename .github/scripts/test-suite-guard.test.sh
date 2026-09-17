#!/usr/bin/env bash
# Runs the exact "Require summary lines" step body from test-suite.yml against
# sample vitest logs, so the guard's pass and fail decisions are checked in CI
# whenever the workflow or this file changes. The body is read from the
# workflow so the check cannot drift from what runs on the runner. A failing
# case also names the message its branch prints, so removing one branch of the
# guard fails this check even when a later branch would still reject the log.
set -u
cd "$(dirname "$0")/../.." || exit 1
workflow=.github/workflows/test-suite.yml
body=$(awk '/name: Require summary lines/{f=1;next} f&&/run: \|/{g=1;next} g&&/^      - name:/{exit} g{sub(/^          /,"");print}' "$workflow")
[ -n "$body" ] || { echo "FAIL: could not extract the Require summary lines step body from $workflow"; exit 1; }
status=0
run() { # name expected-outcome log-content ("-" leaves the log absent) [expected-message]
  local name="$1" expected="$2" message="${4:-}" dir actual output; dir=$(mktemp -d)
  [ "$3" = "-" ] || printf '%b' "$3" > "$dir/vitest.log"
  output=$( export RUNNER_TEMP="$dir"; bash -c "$body" 2>&1 )
  if [ $? -eq 0 ]; then actual=pass; else actual=fail; fi
  if [ "$actual" != "$expected" ]; then echo "FAIL: $name expected $expected got $actual"; status=1
  elif [ -n "$message" ] && ! grep -Fq "$message" <<<"$output"; then echo "FAIL: $name did not report '$message'; got: $output"; status=1
  else echo "PASS: $name -> $actual"; fi
  rm -rf "$dir"
}
run "plain green" pass " Test Files  3 passed (3)\n      Tests  10 passed (10)\n"
run "coloured green" pass "\033[2m Test Files \033[22m \033[1m\033[32m3 passed\033[39m\033[22m\033[90m (3)\033[39m\n      Tests  10 passed (10)\n"
run "green with skips" pass " Test Files  239 passed | 3 skipped (242)\n      Tests  3137 passed | 120 skipped (3257)\n"
run "all skipped" fail " Test Files  1 skipped (1)\n      Tests  3 skipped (3)\n" "No test file passed"
run "failed with zero exit" fail " Test Files  1 failed (1)\n      Tests  1 failed (1)\n" "No test file passed"
run "mixed pass and fail" fail " Test Files  1 failed | 2 passed (3)\n      Tests  1 failed | 9 passed (10)\n" "Failures reported"
run "missing tests line" fail " Test Files  3 passed (3)\n" "Missing 'Tests' summary line"
run "no summary" fail "collecting...\n" "Missing 'Test Files' summary line"
run "worker crash" fail "Error: Worker exited unexpectedly\n Test Files  3 passed (3)\n      Tests  10 passed (10)\n" "Worker crash, unhandled error or partial-result diagnostic"
run "unhandled errors" fail " Test Files  21 passed (21)\n      Tests  189 passed (189)\nVitest caught 16 unhandled errors during the test run.\n" "Worker crash, unhandled error or partial-result diagnostic"
run "empty log" fail "" "Missing 'Test Files' summary line"
run "no log file" fail "-" "No vitest log was written"
exit $status
