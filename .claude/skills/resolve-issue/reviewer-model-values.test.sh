#!/usr/bin/env bash
# Pins section 7b of SKILL.md against telling the writer to spawn a reviewer
# on a model the Agent tool will not accept, or on the writer's own model.
# Run:
#   bash .claude/skills/resolve-issue/reviewer-model-values.test.sh
#
# The Agent tool's "model" parameter validates against a closed set of four
# aliases. Anything else -- a spaced version like "opus 4.6", or a full model
# id like "claude-opus-4-6" -- is refused with an InputValidationError before
# any agent starts, so a skill that names one sends every reviewer call into a
# hard failure. The natural recovery from that failure is the writer's own
# alias, which is a same-model review: the one outcome section 7b exists to
# prevent. Both halves are checked here, because a value can be perfectly
# valid and still defeat the point.
#
# The alias list below is transcribed from the tool's own rejection message,
# observed 2026-09-04. It is a property of the harness, not of this repo, so
# nothing here can detect it drifting. To re-check it, pass a junk model to
# the Agent tool and read the accepted values back out of the error.
#
# Three assertions, over the section 7b writer-to-reviewer table:
#   1. every model value the table names is exactly one of the aliases;
#   2. no row routes a writer to a reviewer of its own family;
#   3. the section 7c reviewer prompt still asks each reviewer to report the
#      model it is actually running as, which is the only runtime check that
#      the pin held.
# A whole-document sweep backs assertion 1 up outside the table.
#
# Only bash, grep and sed are used, so this runs on any checkout.
#
# SKILL_MD overrides the file under test; it exists so the controls at the
# bottom can run this script against a deliberately broken fixture and assert
# it really exits non-zero.
set -u

self="${BASH_SOURCE[0]:-$0}"
dir="$(cd "$(dirname "$self")/../../.." && pwd)"
skill="${SKILL_MD:-$dir/.claude/skills/resolve-issue/SKILL.md}"

# The exact set the Agent tool accepts.
allowed="sonnet opus haiku fable"

fail=0

note_fail() {
  echo "FAIL: $1"
  fail=1
}

is_allowed() {
  local candidate="$1" alias
  for alias in $allowed; do
    [[ "$candidate" == "$alias" ]] && return 0
  done
  return 1
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Strips one matching pair of surrounding quotes, if the whole value is
# quoted. A value that is only partly quoted is left alone, so it fails the
# alias check rather than being silently trimmed into a valid-looking one.
unquote() {
  local s="$1"
  case "$s" in
    '"'*'"') s="${s#\"}"; s="${s%\"}" ;;
    "'"*"'") s="${s#\'}"; s="${s%\'}" ;;
  esac
  printf '%s' "$s"
}

# Every model value named inside one table cell, one per line. The whole cell
# is scanned rather than just its first match, so a row carrying a fallback
# ("model: X, or model: Y if X is rejected") is checked on both values.
#
# A quoted value ends at its closing quote, which keeps any prose after it --
# an explanatory "(current major version)" in the same cell, say -- out of the
# value. Only when the cell quotes nothing does a value run to the next comma
# or cell boundary, so that an unquoted value containing a space is still
# captured whole rather than being cut at the space.
cell_model_values() {
  local cell raw value matches
  cell="$(printf '%s' "$1" | tr '`' ' ')"
  matches="$(printf '%s' "$cell" | grep -oE '"?model"? *: *("[^"]*"|'"'"'[^'"'"']*'"'"')')"
  [[ -z "$matches" ]] && matches="$(printf '%s' "$cell" | grep -oE '"?model"? *: *[^,|]*')"
  while IFS= read -r raw; do
    [[ -z "$raw" ]] && continue
    value="$(printf '%s' "$raw" | sed -E 's/^"?model"? *: *//')"
    value="$(unquote "$(trim "$value")")"
    # Marked so an empty value is still a visible, non-blank line: an empty
    # line would be swallowed by command substitution and read as "nothing
    # wrong here".
    printf '<%s>\n' "$value"
  done <<< "$matches"
}

# --- assertion 1 and 2, over the section 7b table -------------------------
#
# A table row is a writer row when its first cell names one of the aliases,
# case-insensitively, anywhere inside it. Matching on the alias rather than on
# an exact cell layout means re-labelling or emphasising the cell does not
# quietly drop the row out of the check.

rows_seen=0

while IFS= read -r line; do
  first_cell="$(trim "$(printf '%s' "$line" | sed -E 's/^\| *//; s/ *\|.*$//')")"
  rest="$(printf '%s' "$line" | sed -E 's/^\|[^|]*\|//')"

  writer=""
  for alias in $allowed; do
    if printf '%s' "$first_cell" | grep -qiE "(^|[^a-z])$alias([^a-z]|$)"; then
      writer="$alias"
      break
    fi
  done
  [[ -z "$writer" ]] && continue

  rows_seen=$((rows_seen + 1))

  values="$(cell_model_values "$rest")"
  if [[ -z "$values" ]]; then
    note_fail "the '$first_cell' row names no model value at all."
    continue
  fi

  while IFS= read -r marked; do
    value="${marked#<}"
    value="${value%>}"
    if ! is_allowed "$value"; then
      note_fail "the '$first_cell' row names \"$value\", which the Agent tool rejects (accepted: $allowed)."
    elif [[ "$value" == "$writer" ]]; then
      note_fail "the '$first_cell' row routes a $writer writer to a $writer reviewer -- that is a same-model review."
    fi
  done <<< "$values"
done < <(grep -E '^\|' "$skill" 2>/dev/null)

if [[ "$rows_seen" -eq 0 ]]; then
  note_fail "no writer-to-reviewer table row was found -- the check matched nothing, which must not read as a pass."
elif [[ "$fail" -eq 0 ]]; then
  echo "PASS: all $rows_seen writer-to-reviewer rows name an accepted alias from a different family."
fi

# --- assertion 1, swept over the rest of the document ---------------------
#
# Catches a rejected value named in prose outside the table. Only quoted
# values are swept here: unquoted prose has no reliable end, and guessing one
# turns ordinary sentences into false failures.

stray=0
while IFS= read -r raw; do
  value="$(unquote "$(trim "$(printf '%s' "$raw" | sed -E 's/^"?model"? *: *//')")")"
  if ! is_allowed "$value"; then
    note_fail "prose names \"model: $value\", which the Agent tool rejects."
    stray=1
  fi
done < <(grep -vE '^\|' "$skill" 2>/dev/null | grep -oE '"?model"? *: *("[^"]*"|'"'"'[^'"'"']*'"'"')')

[[ "$stray" -eq 0 ]] && echo "PASS: no rejected model value is named in prose."

# --- assertion 3, the runtime half ----------------------------------------

if grep -q 'model name and id you yourself are running as' "$skill" 2>/dev/null; then
  echo "PASS: the reviewer prompt still asks each reviewer to report its own model."
else
  note_fail "the reviewer prompt no longer asks each reviewer to report the model it is running as -- nothing then catches a pin that silently landed on the writer's own model."
fi

# --- controls -------------------------------------------------------------
#
# A check that cannot go red pins nothing. These run this script again against
# broken fixtures and assert the real exit status, so what is proven is the
# whole path from a detected defect to a non-zero exit -- not merely that a
# helper function can print something.

if [[ -z "${REVIEWER_CHECK_INNER:-}" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  # Every fixture carries the assertion-3 sentence, so a control can only go
  # red for the reason it is testing.
  clause='the model name and id you yourself are running as'

  control() {
    local desc="$1" body="$2" out rc
    printf '%s\n%s\n' "$body" "$clause" > "$tmp/fixture.md"
    out="$(REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/fixture.md" bash "$self" 2>&1)"
    rc=$?
    if [[ "$rc" -ne 0 ]]; then
      echo "PASS (control): rejects $desc."
    else
      echo "FAIL (control): accepted $desc -- exit $rc, output: $out"
      fail=1
    fi
  }

  control 'a spaced version, "opus 4.6"'        '| Opus | `model: "opus 4.6"` |'
  control 'a full model id, "claude-opus-5"'    '| Opus | `model: "claude-opus-5"` |'
  control 'a same-family route, Opus to opus'   '| Opus | `model: "opus"` |'
  control 'a same-family route, Fable to fable' '| Fable | `model: "fable"` |'
  control 'two adjacent aliases, "opus haiku"'  '| Opus | `model: "opus haiku"` |'
  control 'an empty value'                      '| Opus | `model: ""` |'
  control 'a single-quoted rejected value'      "| Opus | \`model: 'opus 4.6'\` |"
  control 'an unquoted rejected value'          '| Opus | `model: opus 4.6` |'
  control 'a same-family fallback clause'       '| Opus | `model: "fable"`, or `model: "opus"` if rejected |'
  control 'a second row that is same-family'    '| Opus | `model: "fable"` |
| Opus | `model: "opus"` |'
  control 'an emphasised label, **Opus**, routed to opus' '| **Opus** | `model: "opus"` |'
  control 'a table with no model value'         '| Opus | see below |'

  # And one negative control: a correct table must stay green, or every result
  # above would be meaningless.
  printf '%s\n%s\n' '| Opus | `model: "fable"` |
| Fable | `model: "opus"` |' "$clause" > "$tmp/good.md"
  if REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/good.md" bash "$self" >/dev/null 2>&1; then
    echo "PASS (control): accepts a correct table."
  else
    echo "FAIL (control): rejected a correct table."
    fail=1
  fi

  # The assertion-3 control, run without the clause.
  printf '%s\n' '| Opus | `model: "fable"` |' > "$tmp/noclause.md"
  if REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/noclause.md" bash "$self" >/dev/null 2>&1; then
    echo "FAIL (control): accepted a document with no self-report instruction."
    fail=1
  else
    echo "PASS (control): rejects a document with no self-report instruction."
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "One or more reviewer-model assertions failed."
  exit 1
fi

echo "All reviewer-model assertions passed."
