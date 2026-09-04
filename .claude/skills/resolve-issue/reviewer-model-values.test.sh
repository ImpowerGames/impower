#!/usr/bin/env bash
# Pins section 7b of SKILL.md against telling the writer to spawn a reviewer
# that cannot start, or that runs the writer's own model. Run:
#   bash .claude/skills/resolve-issue/reviewer-model-values.test.sh
#
# Two ways a reviewer is spawned, and both can break silently.
#
# By name, from a definition under .claude/agents/, whose frontmatter carries a
# full model id and so pins an exact version. A name with no definition behind
# it fails at spawn time; a definition whose id matches the writer's own model
# starts fine and quietly delivers a same-model review.
#
# By the Agent tool's model parameter, the fallback when a definition is not
# loaded yet. That parameter validates against a closed set of four aliases and
# refuses everything else -- a spaced version like "opus 4.6", or a full id like
# claude-opus-4-6 -- with an InputValidationError before any agent starts. The
# natural recovery from that error is the writer's own alias, which is again a
# same-model review: the outcome section 7b exists to prevent.
#
# The alias list below is transcribed from the tool's own rejection message,
# observed 2026-09-04. It is a property of the harness, not of this repo, so
# nothing here can detect it drifting. To re-check it, pass a junk model to the
# Agent tool and read the accepted values back out of the error.
#
# Assertions over the section 7b writer-to-reviewer table:
#   1. every reviewer named by subagent_type has a definition under
#      .claude/agents/, and that definition pins a full claude-... model id
#      rather than a bare alias;
#   2. no row routes a writer to a reviewer running the writer's own model;
#   3. every model value named anywhere is exactly one of the four aliases;
#   4. the section 7c reviewer prompt still asks each reviewer to report the
#      model it is actually running as, which is the only runtime check that
#      the pin held.
#
# Only bash, grep and sed are used, so this runs on any checkout.
#
# SKILL_MD and AGENTS_DIR override the paths under test; they exist so the
# controls at the bottom can run this script against deliberately broken
# fixtures and assert it really exits non-zero.
set -u

self="${BASH_SOURCE[0]:-$0}"
dir="$(cd "$(dirname "$self")/../../.." && pwd)"
skill="${SKILL_MD:-$dir/.claude/skills/resolve-issue/SKILL.md}"
agents="${AGENTS_DIR:-$dir/.claude/agents}"

# The exact set the Agent tool accepts.
allowed="sonnet opus haiku fable"

fail=0

if [[ ! -r "$skill" ]]; then
  echo "FAIL: cannot read $skill"
  exit 1
fi

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

# Strips one matching pair of surrounding quotes, if the whole value is quoted.
# A partly quoted value is left alone so it fails its check rather than being
# silently trimmed into something valid-looking.
unquote() {
  local s="$1"
  case "$s" in
    '"'*'"') s="${s#\"}"; s="${s%\"}" ;;
    "'"*"'") s="${s#\'}"; s="${s%\'}" ;;
  esac
  printf '%s' "$s"
}

# Reduces a model label to a comparable form: lowercase, markdown decoration
# dropped, and spaces and dots folded to dashes, so the writer column "Opus 4.6"
# and the pinned id "claude-opus-4-6" can be compared for being the same model,
# and an emphasised "**Opus 5**" still compares equal to a plain one.
normalise() {
  printf '%s' "$1" | tr 'A-Z' 'a-z' |
    sed -E 's/[^a-z0-9]+/-/g; s/^claude-//; s/-+/-/g; s/^-//; s/-$//'
}

# The frontmatter block: the lines between the opening --- on line 1 and the
# next --- . A "model:" further down the body is prose, not a pin, and must not
# be read as one.
frontmatter() {
  awk 'NR==1 && /^---[[:space:]]*$/ {inside=1; next}
       inside && /^---[[:space:]]*$/ {exit}
       inside {print}' "$1"
}

fm_field() {
  local key="$1" file="$2" value
  value="$(frontmatter "$file" | grep -m1 -E "^$key:" | sed -E "s/^$key:[[:space:]]*//")"
  value="${value%$'\r'}"
  unquote "$(trim "$value")"
}

# The model id pinned by the definition declaring NAME, or non-zero if no
# definition declares it. Definitions are matched on their frontmatter "name:",
# which is what a subagent_type resolves against -- a file whose name field and
# filename disagree would otherwise be judged on the wrong one.
definition_model() {
  local want="$1" file
  for file in "$agents"/*.md; do
    [[ -r "$file" ]] || continue
    if [[ "$(fm_field name "$file")" == "$want" ]]; then
      fm_field model "$file"
      return 0
    fi
  done
  return 1
}

# Every value of KEY named inside one cell, one per line, each wrapped in
# markers so an empty value is still a visible line rather than a blank one
# that command substitution would swallow. A quoted value ends at its closing
# quote, which keeps trailing prose in the same cell out of the value; only
# when nothing is quoted does a value run to the next comma or cell boundary,
# so an unquoted value containing a space is still captured whole.
cell_values() {
  local key="$1" cell raw value matches
  cell="$(printf '%s' "$2" | tr '`' ' ')"
  matches="$(printf '%s' "$cell" | grep -oE "\"?$key\"? *: *(\"[^\"]*\"|'[^']*')")"
  [[ -z "$matches" ]] && matches="$(printf '%s' "$cell" | grep -oE "\"?$key\"? *: *[^,|]*")"
  [[ -z "$matches" ]] && return 0
  while IFS= read -r raw; do
    [[ -z "$raw" ]] && continue
    value="$(printf '%s' "$raw" | sed -E "s/^\"?$key\"? *: *//")"
    printf '<%s>\n' "$(unquote "$(trim "$value")")"
  done <<< "$matches"
}

# --- assertions 1, 2 and 3, over the section 7b table ---------------------
#
# A row is a writer row when its first cell names one of the aliases, matched
# case-insensitively anywhere inside the cell, so relabelling or emphasising it
# does not quietly drop the row out of the check.

rows_seen=0

while IFS= read -r line; do
  first_cell="$(trim "$(printf '%s' "$line" | sed -E 's/^\| *//; s/ *\|.*$//')")"
  rest="$(printf '%s' "$line" | sed -E 's/^\|[^|]*\|//')"

  # Every family the first cell names, not just the first: a row like
  # "Fable, Sonnet, Haiku" speaks for three writers, and each of them can
  # collide with the reviewer.
  families=""
  for alias in $allowed; do
    if printf '%s' "$first_cell" | grep -qiE "(^|[^a-z])$alias([^a-z]|$)"; then
      families="$families $alias"
    fi
  done
  families="$(trim "$families")"
  [[ -z "$families" ]] && continue

  rows_seen=$((rows_seen + 1))
  writer="$(normalise "$first_cell")"

  # A row is versioned when it names one family and says something more than
  # the family name -- "Opus 5" rather than "Opus". Only then can a pinned id
  # be compared for being that exact model; otherwise the comparison is by
  # family, which is the strongest claim the row supports.
  versioned=""
  if [[ "$families" != *" "* && "$writer" != "$families" ]]; then
    versioned="yes"
  fi

  # Whether a pinned id names the same model this row's writer runs.
  is_writers_own() {
    local pinned_norm="$1" family
    if [[ -n "$versioned" ]]; then
      [[ "$pinned_norm" == "$writer" || "$pinned_norm" == "$writer"-* ]]
    else
      family="${pinned_norm%%-*}"
      for alias in $families; do
        [[ "$family" == "$alias" ]] && return 0
      done
      return 1
    fi
  }

  names="$(cell_values 'subagent_type' "$rest")"
  models="$(cell_values 'model' "$rest")"

  if [[ -z "$names" && -z "$models" ]]; then
    note_fail "the '$first_cell' row names neither a reviewer definition nor a model."
    continue
  fi

  # Assertion 1 and 2, for a row that spawns a pinned definition by name.
  if [[ -n "$names" ]]; then
    while IFS= read -r marked; do
      name="${marked#<}"; name="${name%>}"
      pinned="$(definition_model "$name")" || {
        note_fail "the '$first_cell' row spawns \"$name\", but no definition in $agents declares that name -- that call fails at spawn time."
        continue
      }
      # A pin has to be a full model id. Anything else -- a bare family alias,
      # or "inherit", which means run on the caller's own model -- follows
      # whatever the harness picks and pins nothing.
      if [[ -z "$pinned" ]]; then
        note_fail "the definition named \"$name\" gives no model, so it pins nothing."
      elif [[ "$pinned" != claude-* ]]; then
        note_fail "the definition named \"$name\" gives \"$pinned\", which is not a full claude-... model id -- it pins nothing."
      elif is_writers_own "$(normalise "$pinned")"; then
        note_fail "the '$first_cell' row spawns \"$name\", which runs $pinned -- the writer's own model, so a same-model review."
      fi
    done <<< "$names"
  fi

  # Assertion 2 and 3, for a row that passes a model alias directly.
  if [[ -n "$models" ]]; then
    while IFS= read -r marked; do
      value="${marked#<}"; value="${value%>}"
      if ! is_allowed "$value"; then
        note_fail "the '$first_cell' row names \"$value\", which the Agent tool rejects (accepted: $allowed)."
      elif is_writers_own "$value"; then
        note_fail "the '$first_cell' row routes a $value writer to a $value reviewer -- that is a same-model review."
      fi
    done <<< "$models"
  fi
done < <(grep -E '^\|' "$skill")

if [[ "$rows_seen" -eq 0 ]]; then
  note_fail "no writer-to-reviewer table row was found -- the check matched nothing, which must not read as a pass."
elif [[ "$fail" -eq 0 ]]; then
  echo "PASS: all $rows_seen writer-to-reviewer rows spawn a reviewer that is not the writer's own model."
fi

# --- assertion 3, swept over the rest of the document ---------------------
#
# Catches a rejected alias named in prose outside the table. Only quoted values
# are swept: unquoted prose has no reliable end, and guessing one would turn
# ordinary sentences into false failures.

stray=0
while IFS= read -r raw; do
  value="$(unquote "$(trim "$(printf '%s' "$raw" | sed -E 's/^"?model"? *: *//')")")"
  if ! is_allowed "$value"; then
    note_fail "prose names \"model: $value\", which the Agent tool rejects."
    stray=1
  fi
done < <(grep -vE '^\|' "$skill" | grep -oE '"?model"? *: *("[^"]*"|'"'"'[^'"'"']*'"'"')')

[[ "$stray" -eq 0 ]] && echo "PASS: no rejected model value is named in prose."

# --- assertion 4, the runtime half ----------------------------------------

if grep -q 'model name and id you yourself are running as' "$skill"; then
  echo "PASS: the reviewer prompt still asks each reviewer to report its own model."
else
  note_fail "the reviewer prompt no longer asks each reviewer to report the model it is running as -- nothing then catches a pin that silently landed on the writer's own model."
fi

# --- controls -------------------------------------------------------------
#
# A check that cannot go red pins nothing. These re-run this script against
# broken fixtures and assert the real exit status, so what is proven is the
# whole path from a detected defect to a non-zero exit -- not merely that a
# helper function can print something.

if [[ -z "${REVIEWER_CHECK_INNER:-}" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  mkdir -p "$tmp/agents"
  printf -- '---\nname: pinned-old\nmodel: claude-opus-4-6\n---\n' > "$tmp/agents/pinned-old.md"
  printf -- '---\nname: pinned-new\nmodel: claude-opus-5\n---\n' > "$tmp/agents/pinned-new.md"
  printf -- '---\nname: pinned-fable\nmodel: claude-fable-5-1\n---\n' > "$tmp/agents/pinned-fable.md"
  printf -- '---\nname: pinned-sonnet\nmodel: claude-sonnet-5\n---\n' > "$tmp/agents/pinned-sonnet.md"
  printf -- '---\nname: unpinned\nmodel: opus\n---\n' > "$tmp/agents/unpinned.md"
  printf -- '---\nname: quoted-alias\nmodel: "opus"\n---\n' > "$tmp/agents/quoted-alias.md"
  printf -- '---\nname: inheriting\nmodel: inherit\n---\n' > "$tmp/agents/inheriting.md"
  printf -- '---\nname: dated\nmodel: claude-opus-5-20260501\n---\n' > "$tmp/agents/dated.md"
  printf -- '---\nname: suffixed\nmodel: claude-opus-5[1m]\n---\n' > "$tmp/agents/suffixed.md"
  printf -- '---\nname: modelless\n---\n' > "$tmp/agents/modelless.md"
  printf -- '---\nname: body-only\n---\nmodel: claude-opus-4-6\n' > "$tmp/agents/body-only.md"
  # Filename and declared name deliberately disagree, so the resolver is shown
  # to match on the frontmatter name rather than on the path.
  printf -- '---\nname: declared-name\nmodel: claude-opus-4-6\n---\n' > "$tmp/agents/some-other-file.md"

  clause='the model name and id you yourself are running as'

  control() {
    local desc="$1" body="$2" out rc
    printf '%s\n%s\n' "$body" "$clause" > "$tmp/fixture.md"
    out="$(REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/fixture.md" AGENTS_DIR="$tmp/agents" bash "$self" 2>&1)"
    rc=$?
    if [[ "$rc" -ne 0 ]]; then
      echo "PASS (control): rejects $desc."
    else
      echo "FAIL (control): accepted $desc -- exit $rc, output: $out"
      fail=1
    fi
  }

  accepts() {
    local desc="$1" body="$2" out rc
    printf '%s\n%s\n' "$body" "$clause" > "$tmp/fixture.md"
    out="$(REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/fixture.md" AGENTS_DIR="$tmp/agents" bash "$self" 2>&1)"
    rc=$?
    if [[ "$rc" -eq 0 ]]; then
      echo "PASS (control): accepts $desc."
    else
      echo "FAIL (control): rejected $desc -- output: $out"
      fail=1
    fi
  }

  control 'a reviewer name with no definition behind it' '| Opus 5 | `subagent_type: "no-such-reviewer"` |'
  control 'a definition that pins nothing'               '| Opus 5 | `subagent_type: "modelless"` |'
  control 'a definition holding a bare alias'            '| Opus 5 | `subagent_type: "unpinned"` |'
  control 'a definition holding a quoted alias'          '| Opus 5 | `subagent_type: "quoted-alias"` |'
  control 'a definition holding model: inherit'          '| Opus 5 | `subagent_type: "inheriting"` |'
  control 'a model line in the body, not the frontmatter' '| Opus 5 | `subagent_type: "body-only"` |'
  control 'a pinned reviewer on the writer own model'    '| Opus 5 | `subagent_type: "pinned-new"` |'
  control 'the same, for the older version'              '| Opus 4.6 | `subagent_type: "pinned-old"` |'
  control 'a dated snapshot of the writer own model'     '| Opus 5 | `subagent_type: "dated"` |'
  control 'a long-context suffix on the writer own model' '| Opus 5 | `subagent_type: "suffixed"` |'
  control 'a version-less writer routed to its family'   '| Opus | `subagent_type: "pinned-new"` |'
  control 'a multi-family row routed to one of them'     '| Fable, Sonnet, Haiku | `subagent_type: "pinned-sonnet"` |'
  control 'a multi-family row on the alias path'         '| Fable, Sonnet, Haiku | `model: "fable"` |'
  control 'a spaced version, "opus 4.6"'                 '| Opus | `model: "opus 4.6"` |'
  control 'a full model id passed to the parameter'      '| Opus | `model: "claude-opus-5"` |'
  control 'a same-family alias route, Opus to opus'      '| Opus | `model: "opus"` |'
  control 'a same-family alias route, Fable to fable'    '| Fable | `model: "fable"` |'
  control 'two adjacent aliases, "opus haiku"'           '| Opus | `model: "opus haiku"` |'
  control 'an empty model value'                         '| Opus | `model: ""` |'
  control 'a single-quoted rejected value'               "| Opus | \`model: 'opus 4.6'\` |"
  control 'an unquoted rejected value'                   '| Opus | `model: opus 4.6` |'
  control 'a same-family fallback clause'                '| Opus | `model: "fable"`, or `model: "opus"` if rejected |'
  control 'a second row that is same-family'             '| Opus | `model: "fable"` |
| Opus | `model: "opus"` |'
  control 'an emphasised label, **Opus**, routed to opus' '| **Opus** | `model: "opus"` |'
  control 'a row naming neither a reviewer nor a model'  '| Opus | see below |'

  accepts 'a correct pinned table' '| Opus 5 | `subagent_type: "pinned-old"` |
| Opus 4.6 | `subagent_type: "pinned-new"` |
| Fable, Sonnet, Haiku | `subagent_type: "pinned-new"` |'
  accepts 'a correct alias-fallback table' '| Opus | `model: "fable"` |
| Fable, Sonnet, Haiku | `model: "opus"` |'
  accepts 'a definition resolved by its declared name, not its filename' '| Opus 5 | `subagent_type: "declared-name"` |'

  # Assertion 4, run without the clause present.
  printf '%s\n' '| Opus 5 | `subagent_type: "pinned-old"` |' > "$tmp/noclause.md"
  if REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/noclause.md" AGENTS_DIR="$tmp/agents" bash "$self" >/dev/null 2>&1; then
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
