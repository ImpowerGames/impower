#!/usr/bin/env bash
# Pins section 7b of SKILL.md against naming a reviewer model the Agent tool
# will not accept. Run:
#   bash .claude/skills/resolve-issue/reviewer-model-values.test.sh
#
# The Agent tool's "model" parameter validates against a closed set of four
# aliases. Anything else -- a spaced version like "opus 4.6", or a full model
# id like "claude-opus-4-6" -- is refused with an InputValidationError before
# any agent starts, so a skill that instructs the writer to pass one sends
# every reviewer call into a hard failure.
#
# Two things are checked. First, every model value SKILL.md tells the writer
# to pass is one of the four aliases. Second, the writer-to-reviewer table
# never sends an Opus writer to an Opus reviewer, which is the same-model
# review section 7b exists to prevent -- a value can be perfectly valid and
# still defeat the point.
#
# Only bash and grep are used, so this runs on any checkout.
set -u

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
skill="$dir/.claude/skills/resolve-issue/SKILL.md"

# The exact set the Agent tool accepts.
allowed=" sonnet opus haiku fable "

fail=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Prints one offending model value per line; prints nothing when all are valid.
# Exits non-zero if the file names no model values at all -- a pattern that
# silently matches nothing would otherwise read as a clean pass.
scan_values() {
  local file="$1" found=0 value
  while IFS= read -r match; do
    found=1
    value="${match#model: \"}"
    value="${value%\"}"
    case "$allowed" in
      *" $value "*) ;;
      *) echo "$value" ;;
    esac
  done < <(grep -o 'model: "[^"]*"' "$file")
  [[ "$found" -eq 1 ]]
}

# Prints the reviewer model an Opus writer is sent to, from the table row
# whose first column is Opus.
opus_writer_reviewer() {
  grep -E '^\| *Opus *\|' "$1" | grep -o 'model: "[^"]*"' | head -1
}

# --- the assertions -------------------------------------------------------

offenders="$(scan_values "$skill")"
if [[ $? -ne 0 ]]; then
  echo "FAIL: SKILL.md names no model values at all -- the check matched nothing."
  fail=1
elif [[ -n "$offenders" ]]; then
  echo "FAIL: SKILL.md names model values the Agent tool rejects:"
  # Read line by line rather than word-splitting: a value like "opus 4.6"
  # contains a space, and splitting it would report one bad value as two.
  while IFS= read -r offender; do
    echo "  \"$offender\""
  done <<< "$offenders"
  echo "  Accepted values are: sonnet opus haiku fable"
  fail=1
else
  echo "PASS: every model value in SKILL.md is an accepted Agent alias."
fi

reviewer="$(opus_writer_reviewer "$skill")"
if [[ -z "$reviewer" ]]; then
  echo "FAIL: no table row sends an Opus writer to a reviewer."
  fail=1
elif [[ "$reviewer" == 'model: "opus"' ]]; then
  echo "FAIL: an Opus writer is sent to an Opus reviewer -- that is a same-model review."
  fail=1
else
  echo "PASS: an Opus writer is sent to a different family ($reviewer)."
fi

# --- positive control -----------------------------------------------------
# A checker that cannot go red pins nothing, so prove both checks reject the
# shape this ticket was filed about.

printf '%s\n' '| Opus | `model: "opus 4.6"` |' > "$tmp/bad.md"

control="$(scan_values "$tmp/bad.md")"
if [[ "$control" == "opus 4.6" ]]; then
  echo "PASS (control): the value check rejects \"opus 4.6\"."
else
  echo "FAIL (control): the value check did not reject \"opus 4.6\" -- got '$control'."
  fail=1
fi

printf '%s\n' '| Opus | `model: "opus"` |' > "$tmp/same.md"

if [[ "$(opus_writer_reviewer "$tmp/same.md")" == 'model: "opus"' ]]; then
  echo "PASS (control): the table check sees an Opus writer sent to Opus."
else
  echo "FAIL (control): the table check missed an Opus-to-Opus row."
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "One or more reviewer-model assertions failed."
  exit 1
fi

echo "All reviewer-model assertions passed."
