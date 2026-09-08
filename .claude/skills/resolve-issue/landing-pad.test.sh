#!/usr/bin/env bash
# Pins the glue the resolve-issue landing pad exists for. The pad is an ordered
# checklist with one mandatory invocation line per step skill, a line that
# begins `Invoke `/<step>` now` and carries `(skill name `<step>`)`, the name a
# session hands the Skill tool; a session that meets no such line skips that
# step, and nothing else would notice. So this asserts that the pad has exactly
# one such line for write-regression-test, drive-web-editor and review-pr, in
# that order, that the parenthetical on each names the same step, that each
# step's SKILL.md exists and declares that name in its frontmatter (the harness
# resolves a skill by that `name:`, not by its directory), that the completion
# gate follows every invocation, that the VS Code driver (drive-vscode-web,
# invoked only for an extension ticket) is invoked with the same parenthetical
# in exactly one sentence of §3 and one of §6 and exists under that name, and
# that the file stays short enough to load into every session. A conditional
# mention elsewhere in the pad (the repro bullets) does not begin a line with
# the step phrase, so it is not counted, and neither is a line that forbids
# an invocation or a line inside a fenced block, which is an example rather
# than an instruction. Run:
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

# Line numbers of the lines outside fenced blocks that begin with the mandatory
# phrase for a step.
invocations() {
  awk -v phrase="Invoke \`/$1\` now" '
    /^```/ { fenced = !fenced; next }
    !fenced && index($0, phrase) == 1 { print NR }
  ' "$skill"
}

# prev is the highest invocation line seen so far: each step must come after
# it, and the gate must come after all of them, so a step out of order never
# lowers it.
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
  (( at > prev )) && prev=$at
  line=$(sed -n "${at}p" "$skill")
  if [[ "$line" != *"(skill name \`$step\`)"* ]]; then
    note_fail "/$step is invoked at line $at but the line does not say (skill name \`$step\`)"
    continue
  fi
  if [[ ! -r "$skills_dir/$step/SKILL.md" ]]; then
    note_fail "/$step is invoked at line $at but $skills_dir/$step/SKILL.md does not exist"
    continue
  fi
  if ! grep -q "^name: $step\$" "$skills_dir/$step/SKILL.md"; then
    note_fail "/$step is invoked at line $at but $skills_dir/$step/SKILL.md does not declare name: $step"
    continue
  fi
  if (( at < prev )); then
    note_fail "/$step is invoked at line $at, before the previous step's invocation at line $prev"
    continue
  fi
  echo "PASS  /$step invoked at line $at"
done

# The VS Code driver is invoked only for an `app: vscode-extension` ticket, so
# its invocations are conditional sentences rather than lines of their own:
# one in the reproduction bullets of §3 and one in §6, each carrying the
# parenthetical the Skill tool needs. Each section holds exactly one such
# sentence outside a fence that does not forbid it, and the skill exists under
# that name, or a session on such a ticket is sent nowhere.
vsc='invoke `/drive-vscode-web` (skill name `drive-vscode-web`)'

# Line numbers of the lines outside fenced blocks, in the section whose
# heading begins with $1, that invoke the VS Code driver and do not forbid it.
vscode_invocations() {
  awk -v head="$1" -v phrase="$vsc" '
    /^```/ { fenced = !fenced; next }
    /^## / { inside = index($0, head) == 1 }
    !fenced && inside && index(tolower($0), phrase) > 0 && index(tolower($0), "not " phrase) == 0 && index(tolower($0), "never " phrase) == 0 { print NR }
  ' "$skill"
}

vscode_ok=1
vscode_at=()
for head in "## 3." "## 6."; do
  found=$(vscode_invocations "$head")
  count=$(printf '%s\n' "$found" | grep -c .)
  if (( count != 1 )); then
    note_fail "/drive-vscode-web is invoked in $count sentence(s) of $head, outside fences and not forbidden; the pad has one"
    vscode_ok=0
  else
    vscode_at+=("$found")
  fi
done
if (( vscode_ok )); then
  if [[ ! -r "$skills_dir/drive-vscode-web/SKILL.md" ]]; then
    note_fail "/drive-vscode-web is invoked but $skills_dir/drive-vscode-web/SKILL.md does not exist"
  elif ! grep -q '^name: drive-vscode-web$' "$skills_dir/drive-vscode-web/SKILL.md"; then
    note_fail "/drive-vscode-web is invoked but $skills_dir/drive-vscode-web/SKILL.md does not declare name: drive-vscode-web"
  else
    echo "PASS  /drive-vscode-web invoked at lines ${vscode_at[0]} and ${vscode_at[1]}"
  fi
fi

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

wrt_line=$(grep "^$wrt" "$skill")
{ grep -v "^$wrt" "$skill"; echo "$wrt_line"; } > "$tmp/out-of-order.md"
expect_fail "write-regression-test moved after the other invocations and the gate" "$tmp/out-of-order.md" "before the previous step's invocation"
if grep -q '^PASS  completion gate' <<< "$(SKILL_MD="$tmp/out-of-order.md" LANDING_PAD_CHECK_INNER=1 bash "$self" 2>&1)"; then
  note_fail "control 'write-regression-test moved after the other invocations and the gate': the gate is reported as passing although an invocation follows it"
fi

rev_line=$(grep "^$rev" "$skill")
{ grep -v "^$rev" "$skill"; echo "$rev_line"; } > "$tmp/gate-first.md"
expect_fail "review-pr invoked after the gate" "$tmp/gate-first.md" "comes before the last invocation"

sed "s|^$wrt (skill name \`write-regression-test\`)|$wrt (skill name \`drive-web-editor\`)|" "$skill" > "$tmp/wrong-name.md"
if grep -q "^$wrt (skill name \`drive-web-editor\`)" "$tmp/wrong-name.md"; then
  expect_fail "the parenthetical names another skill" "$tmp/wrong-name.md" "does not say (skill name"
else
  note_fail "control 'the parenthetical names another skill': the fixture was not built"
fi

awk -v p="$wrt" 'index($0, p) == 1 { print "```md"; print; print "```"; next } { print }' "$skill" > "$tmp/fenced.md"
if grep -q "^$wrt" "$tmp/fenced.md"; then
  expect_fail "the invocation line survives only inside a fenced example" "$tmp/fenced.md" "no line begins with $wrt"
else
  note_fail "control 'the invocation line survives only inside a fenced example': the fixture was not built"
fi

for step in write-regression-test drive-web-editor review-pr; do
  mkdir -p "$tmp/renamed/$step"
  printf -- '---\nname: %s-renamed\ndescription: a renamed copy\n---\n' "$step" > "$tmp/renamed/$step/SKILL.md"
done
SKILLS_DIR="$tmp/renamed" expect_fail "a step skill whose frontmatter declares another name" "$skill" "does not declare name:"

sed 's|(skill name `drive-vscode-web`)||g' "$skill" > "$tmp/no-vscode.md"
expect_fail "drive-vscode-web parenthetical removed everywhere" "$tmp/no-vscode.md" "invoked in 0 sentence(s) of ## 3."

awk -v p="$vsc" '/^## /{ in6 = index($0, "## 6.") == 1 } in6 { i = index($0, p); if (i) $0 = substr($0, 1, i - 1) "there is no headless driver" substr($0, i + length(p)) } { print }' "$skill" > "$tmp/no-vscode-s6.md"
if grep -q "there is no headless driver" "$tmp/no-vscode-s6.md" && grep -qi "$vsc" "$tmp/no-vscode-s6.md"; then
  expect_fail "the §6 sentence says there is no headless driver, the §3 bullet kept" "$tmp/no-vscode-s6.md" "invoked in 0 sentence(s) of ## 6."
else
  note_fail "control 'the §6 sentence says there is no headless driver, the §3 bullet kept': the fixture was not built"
fi

sed 's|[Ii]nvoke `/drive-vscode-web` (skill name `drive-vscode-web`)|do not invoke `/drive-vscode-web` (skill name `drive-vscode-web`)|g' "$skill" > "$tmp/vscode-forbidden.md"
if grep -q "do not $vsc" "$tmp/vscode-forbidden.md"; then
  expect_fail "both drive-vscode-web sentences turned into prohibitions" "$tmp/vscode-forbidden.md" "invoked in 0 sentence(s) of ## 3."
else
  note_fail "control 'both drive-vscode-web sentences turned into prohibitions': the fixture was not built"
fi

awk -v p="$vsc" '/^## /{ in3 = index($0, "## 3.") == 1 } in3 && index(tolower($0), p) { print "```md"; print; print "```"; next } { print }' "$skill" > "$tmp/vscode-fenced.md"
if grep -qi "$vsc" "$tmp/vscode-fenced.md"; then
  expect_fail "the §3 drive-vscode-web bullet survives only inside a fenced example" "$tmp/vscode-fenced.md" "invoked in 0 sentence(s) of ## 3."
else
  note_fail "control 'the §3 drive-vscode-web bullet survives only inside a fenced example': the fixture was not built"
fi

mkdir -p "$tmp/renamed/drive-vscode-web"
printf -- '---\nname: drive-vscode-web-renamed\ndescription: a renamed copy\n---\n' > "$tmp/renamed/drive-vscode-web/SKILL.md"
SKILLS_DIR="$tmp/renamed" expect_fail "the VS Code driver skill declares another name" "$skill" "does not declare name: drive-vscode-web"

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
