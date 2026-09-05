#!/usr/bin/env bash
# Pins the glue the resolve-issue landing pad exists for. The pad is an ordered
# checklist with one mandatory invocation line per step skill, a line that
# begins `Invoke `/<step>` now`; a session that meets no such line skips that
# step, and nothing else would notice. So this asserts that the pad has exactly
# one such line for write-regression-test, drive-web-editor and review-pr, in
# that order, that each names a skill that exists, that the completion gate
# follows them, and that the file stays short enough to load into every
# session. A conditional mention elsewhere in the pad (the repro bullets) does
# not begin a line with that phrase, so it is not counted, and neither is a
# line that forbids the invocation. Run:
#   bash .claude/skills/resolve-issue/landing-pad.test.sh
#
# SKILL_MD overrides the file under test and SKILLS_DIR the directory the step
# skills are resolved in, so the controls at the bottom can run this script
# against deliberately broken copies and assert it fails for the reason named.
set -u

self="${BASH_SOURCE[0]:-$0}"
dir="$(cd "$(dirname "$self")/../../.." && pwd)"
skill="${SKILL_MD:-$dir/.claude/skills/resolve-issue/SKILL.md}"
skills_dir="${SKILLS_DIR:-$dir/.claude/skills}"
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

# Line numbers of the lines that begin with the mandatory phrase for a step.
invocations() {
  grep -n "^Invoke \`/$1\` now" "$skill" | cut -d: -f1
}

prev=0
for step in write-regression-test drive-web-editor review-pr; do
  found=$(invocations "$step")
  count=$(printf '%s\n' "$found" | grep -c .)
  if (( count == 0 )); then
    note_fail "no line begins with Invoke \`/$step\` now"
    continue
  fi
  if (( count > 1 )); then
    note_fail "/$step has $count mandatory invocation lines ($(echo $found | tr ' ' ,)); the pad has one per step"
    continue
  fi
  at=$found
  if [[ ! -r "$skills_dir/$step/SKILL.md" ]]; then
    note_fail "/$step is invoked at line $at but $skills_dir/$step/SKILL.md does not exist"
    prev=$at
    continue
  fi
  if (( at <= prev )); then
    note_fail "/$step is invoked at line $at, before the previous step's invocation at line $prev"
    prev=$at
    continue
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

# Controls: each broken copy must make this script exit non-zero, its output
# must name the reason the label names, and no step that fails may also be
# reported as passing.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

expect_fail() {
  local label="$1" fixture="$2" reason="$3" out status s
  out=$(SKILL_MD="$fixture" LANDING_PAD_CHECK_INNER=1 bash "$self" 2>&1)
  status=$?
  if (( status == 0 )); then
    note_fail "control '$label' passed; the check does not catch it"
    return
  fi
  if ! grep -qF -- "$reason" <<< "$out"; then
    note_fail "control '$label' failed, but not with '$reason':"
    sed 's/^/    /' <<< "$out"
    return
  fi
  for s in $(grep -o 'FAIL: /[a-z-]*' <<< "$out" | cut -c8-); do
    if grep -q "^PASS  /$s " <<< "$out"; then
      note_fail "control '$label': /$s is reported as both failing and passing"
      return
    fi
  done
  echo "PASS  control: $label"
}

wrt='Invoke `/write-regression-test` now'
dwe='Invoke `/drive-web-editor` now'
rev='Invoke `/review-pr` now'

grep -v "^$rev" "$skill" > "$tmp/no-review.md"
expect_fail "review-pr invocation removed" "$tmp/no-review.md" "no line begins with $rev"

grep -v "^$wrt" "$skill" > "$tmp/no-test.md"
expect_fail "write-regression-test invocation removed, its repro mention kept" "$tmp/no-test.md" "no line begins with $wrt"

grep -v "^$dwe" "$skill" > "$tmp/no-drive.md"
expect_fail "drive-web-editor invocation removed, its repro mention kept" "$tmp/no-drive.md" "no line begins with $dwe"

sed "s|^$wrt|Do not invoke \`/write-regression-test\` now|" "$skill" > "$tmp/forbidden.md"
if grep -q '^Do not invoke `/write-regression-test` now' "$tmp/forbidden.md"; then
  expect_fail "invocation line turned into a prohibition" "$tmp/forbidden.md" "no line begins with $wrt"
else
  note_fail "control 'invocation line turned into a prohibition': the fixture was not built"
fi

{ cat "$skill"; echo "$wrt."; } > "$tmp/twice.md"
expect_fail "write-regression-test invoked twice" "$tmp/twice.md" "has 2 mandatory invocation lines"

{ grep -v "^$wrt" "$skill"; echo "$wrt."; } > "$tmp/out-of-order.md"
expect_fail "write-regression-test invoked after drive-web-editor" "$tmp/out-of-order.md" "before the previous step's invocation"

{ grep -v "^$rev" "$skill"; echo "$rev."; } > "$tmp/gate-first.md"
expect_fail "review-pr invoked after the gate" "$tmp/gate-first.md" "comes before the last invocation"

grep -v '^## The completion gate' "$skill" > "$tmp/no-gate.md"
expect_fail "completion gate removed" "$tmp/no-gate.md" "no '## The completion gate' heading"

{ cat "$skill"; yes '' | head -200; } > "$tmp/too-long.md"
expect_fail "200 lines or more" "$tmp/too-long.md" "the landing pad stays under 200"

mkdir -p "$tmp/no-skills"
SKILLS_DIR="$tmp/no-skills" expect_fail "a step skill that does not exist" "$skill" "does not exist"

if (( fail )); then
  exit 1
fi
echo "All landing-pad assertions passed."
