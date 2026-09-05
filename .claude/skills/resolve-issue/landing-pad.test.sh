#!/usr/bin/env bash
# Pins the glue the resolve-issue landing pad exists for. The pad is an ordered
# checklist that says where to invoke each step skill; a session that meets no
# invocation line skips that step, and nothing else would notice. So this
# asserts that the pad invokes write-regression-test, drive-web-editor and
# review-pr, in that order, that the completion gate follows them, and that
# the file stays short enough to load into every session. Run:
#   bash .claude/skills/resolve-issue/landing-pad.test.sh
#
# SKILL_MD overrides the file under test so the controls at the bottom can run
# this script against deliberately broken copies and assert it exits non-zero.
set -u

self="${BASH_SOURCE[0]:-$0}"
dir="$(cd "$(dirname "$self")/../../.." && pwd)"
skill="${SKILL_MD:-$dir/.claude/skills/resolve-issue/SKILL.md}"
fail=0

note_fail() {
  echo "FAIL: $1"
  fail=1
}

if [[ ! -r "$skill" ]]; then
  echo "FAIL: cannot read $skill"
  exit 1
fi

lines=$(wc -l < "$skill")
if (( lines >= 200 )); then
  note_fail "$skill is $lines lines; the landing pad stays under 200"
else
  echo "PASS  $lines lines"
fi

# The last line that invokes each step skill; those lines ascend in workflow
# order, and the completion gate comes after all of them.
last_invocation() {
  grep -in "invoke \`/$1\`" "$skill" | tail -1 | cut -d: -f1
}

prev=0
for step in write-regression-test drive-web-editor review-pr; do
  at=$(last_invocation "$step")
  if [[ -z "$at" ]]; then
    note_fail "no line invokes /$step"
    continue
  fi
  if (( at <= prev )); then
    note_fail "/$step is invoked at line $at, before the previous step's invocation at line $prev"
  fi
  prev=$at
  echo "PASS  /$step invoked at line $at"
done

gate=$(grep -n '^## The completion gate' "$skill" | cut -d: -f1)
if [[ -z "$gate" ]]; then
  note_fail "no '## The completion gate' heading"
elif (( gate <= prev )); then
  note_fail "the completion gate at line $gate comes before the last invocation at line $prev"
else
  echo "PASS  completion gate at line $gate"
fi

if [[ -n "${LANDING_PAD_CHECK_INNER:-}" ]]; then
  exit $fail
fi
if (( fail )); then
  exit 1
fi

# Controls: each broken copy must make this script exit non-zero.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

expect_fail() {
  local label="$1" fixture="$2"
  if SKILL_MD="$fixture" LANDING_PAD_CHECK_INNER=1 bash "$self" > /dev/null 2>&1; then
    note_fail "control '$label' passed; the check does not catch it"
  else
    echo "PASS  control: $label"
  fi
}

grep -v 'Invoke `/review-pr`' "$skill" > "$tmp/no-review.md"
expect_fail "review-pr invocation removed" "$tmp/no-review.md"

{ cat "$skill"; echo 'Invoke `/write-regression-test` now.'; } > "$tmp/out-of-order.md"
expect_fail "write-regression-test invoked after review-pr and the gate" "$tmp/out-of-order.md"

grep -v '^## The completion gate' "$skill" > "$tmp/no-gate.md"
expect_fail "completion gate removed" "$tmp/no-gate.md"

{ cat "$skill"; yes '' | head -200; } > "$tmp/too-long.md"
expect_fail "200 lines or more" "$tmp/too-long.md"

if (( fail )); then
  exit 1
fi
echo "All landing-pad assertions passed."
