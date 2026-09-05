#!/usr/bin/env bash
# Pins the reviewer-model section of the review-pr skill against telling the writer to spawn a reviewer
# that cannot start, or that runs the writer's own model. Run:
#   bash .claude/skills/review-pr/reviewer-model-values.test.sh
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
# same-model review: the outcome that section exists to prevent.
#
# The alias list below is transcribed from the tool's own rejection message,
# observed 2026-09-04. It is a property of the harness, not of this repo, so
# nothing here can detect it drifting. To re-check it, pass a junk model to the
# Agent tool and read the accepted values back out of the error.
#
# Assertions over the writer-to-reviewer table:
#   1. every reviewer named by subagent_type has a definition under
#      .claude/agents/, and that definition pins a full claude-... model id
#      rather than a bare alias;
#   2. no row routes a writer to a reviewer running the writer's own model;
#   3. every model value named anywhere is exactly one of the four aliases;
#   4. the reviewer prompt still asks each reviewer to report the
#      model it is actually running as;
#   5. the abort contract survives -- the prompt names the writer's own model
#      and covers a placeholder that was never substituted, every definition
#      requires the reviewer to compare itself against that model and stop on a
#      match, and the section says what to do with an abort. A pinned id that
#      stops naming a live model is substituted silently, most often by the
#      writer's own model, so that comparison is what turns a retired pin into a
#      cheap abort rather than a full review that reads as independent.
#
# Know what assertion 5 is worth. It reads prose, so it catches a rule that was
# deleted, commented out, or moved out of the prompt reviewers actually receive.
# It cannot catch a rule that is still present and has been inverted -- text
# telling a reviewer to disregard an abort passes every grep here. Nor can it
# make a reviewer obey: the abort is an instruction a model chooses to follow,
# not something the harness enforces. Reading each reviewer's first line, which
# the skill requires, is the check this file cannot be.
#
# Only bash, grep and sed are used, so this runs on any checkout.
#
# SKILL_MD and AGENTS_DIR override the paths under test; they exist so the
# controls at the bottom can run this script against deliberately broken
# fixtures and assert it really exits non-zero.
set -u

self="${BASH_SOURCE[0]:-$0}"
dir="$(cd "$(dirname "$self")/../../.." && pwd)"
skill="${SKILL_MD:-$dir/.claude/skills/review-pr/SKILL.md}"
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

# The file with HTML comments removed. A sentinel sitting inside a commented-out
# block is not an instruction anyone follows, so the prose assertions must not
# see it -- otherwise deleting a rule and leaving its old text commented above
# reads as a pass.
uncommented() {
  awk '{
    line = $0; out = ""
    while (length(line) > 0) {
      if (incomment) {
        p = index(line, "-->")
        if (p == 0) { line = "" } else { line = substr(line, p + 3); incomment = 0 }
      } else {
        p = index(line, "<!--")
        if (p == 0) { out = out line; line = "" }
        else { out = out substr(line, 1, p - 1); line = substr(line, p + 4); incomment = 1 }
      }
    }
    print out
  }' "$1"
}

# Only the blockquote given to reviewers verbatim. A rule that has drifted out
# of the prompt into surrounding commentary no longer reaches a reviewer, so an
# assertion about the prompt has to look at the prompt.
prompt_block() {
  uncommented "$1" | grep '^>'
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
  # Drop a trailing YAML comment, which a parser would not treat as part of the
  # value, so this reads the same id the harness does. Only outside quotes: a #
  # inside a quoted value is a literal.
  case "$value" in
    '"'*|"'"*) ;;
    *) value="${value%%[[:space:]]#*}" ;;
  esac
  unquote "$(trim "$value")"
}

# The model id pinned by the definition declaring NAME, or non-zero if no
# definition declares it. Definitions are matched on their frontmatter "name:",
# which is what a subagent_type resolves against -- a file whose name field and
# filename disagree would otherwise be judged on the wrong one.
# Exit 1 when nothing declares NAME, 2 when more than one does -- two files
# claiming the same name leave the harness free to resolve either, so reading
# whichever sorts first would be judging a definition that may never run.
definition_model() {
  local want="$1" file found="" model=""
  for file in "$agents"/*.md; do
    [[ -r "$file" ]] || continue
    if [[ "$(fm_field name "$file")" == "$want" ]]; then
      [[ -n "$found" ]] && return 2
      found="yes"
      model="$(fm_field model "$file")"
    fi
  done
  [[ -z "$found" ]] && return 1
  printf '%s' "$model"
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

# --- assertions 1, 2 and 3, over the writer-to-reviewer table---------------
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
      pinned="$(definition_model "$name")"
      case "$?" in
        1)
          note_fail "the '$first_cell' row spawns \"$name\", but no definition in $agents declares that name -- that call fails at spawn time."
          continue ;;
        2)
          note_fail "more than one definition in $agents declares the name \"$name\", so which model it runs is undecided."
          continue ;;
      esac
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

if prompt_block "$skill" | grep -q 'model name and id you yourself are running as'; then
  echo "PASS: the reviewer prompt still asks each reviewer to report its own model."
else
  note_fail "the reviewer prompt no longer asks each reviewer to report the model it is running as -- nothing then catches a pin that silently landed on the writer's own model."
fi

# --- assertion 5, the abort contract ---------------------------------------
#
# A retired pin is substituted silently, most often by the writer's own model,
# so the reviewer comparing itself against the writer before it reads anything
# is what turns that into a cheap abort instead of a full review that reads as
# independent. Three places have to agree, and all three are prose that an
# unrelated edit can quietly drop: the prompt has to tell the reviewer which
# model the writer is, every definition has to require the comparison, and the
# section has to say what to do with an abort.

if prompt_block "$skill" | grep -q 'ABORT: pin failed'; then
  echo "PASS: the reviewer prompt carries the abort contract."
else
  note_fail "the reviewer prompt no longer tells a reviewer to abort when it is the writer's own model."
fi

# An unsubstituted placeholder is the quiet way this guard dies: the reviewer
# compares its own id against the literal word WRITER, sees no match, and
# reviews on regardless of which model it is.
if prompt_block "$skill" | grep -q 'ABORT: writer model not supplied'; then
  echo "PASS: the reviewer prompt handles an unsubstituted writer model."
else
  note_fail "the reviewer prompt no longer tells a reviewer to abort when the writer's model was never filled in, so a bare WRITER placeholder passes the comparison."
fi

# The reviewer can only compare itself against the writer if the writer is
# told to substitute its own model id into the prompt, so that instruction is
# what gets pinned rather than the sentence wrapped around it.
if uncommented "$skill" | grep -q 'WRITER = your own model id'; then
  echo "PASS: the writer is told to name its own model in the reviewer prompt."
else
  note_fail "the reviewer prompt no longer tells the writer to substitute its own model id, so a reviewer has nothing to compare itself against."
fi

definitions_seen=0
definitions_bad=0
for file in "$agents"/*.md; do
  [[ -r "$file" ]] || continue
  definitions_seen=$((definitions_seen + 1))
  if ! uncommented "$file" | grep -q 'ABORT: pin failed'; then
    note_fail "$(basename "$file") does not require its reviewer to abort when it is the writer's own model."
    definitions_bad=1
  fi
done

if [[ "$definitions_seen" -eq 0 ]]; then
  note_fail "no reviewer definitions were found in $agents."
elif [[ "$definitions_bad" -eq 0 ]]; then
  echo "PASS: all $definitions_seen reviewer definitions require the abort check."
fi

if uncommented "$skill" | grep -q 'An abort is a result, not an error'; then
  echo "PASS: the section says what to do with an abort."
else
  note_fail "the section no longer says what to do when a reviewer aborts, so a stale pin has no recovery path."
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
  # Every fixture definition carries the abort line, so a control can only go
  # red for the reason it is testing rather than for assertion 5.
  abort_line='If you are the writer model, reply ABORT: pin failed'
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
  # A trailing YAML comment is not part of the value a parser would read.
  printf -- '---\nname: commented\nmodel: claude-opus-5 # pinned deliberately\n---\n' > "$tmp/agents/commented.md"
  # Two files claiming one name, pinning different models.
  printf -- '---\nname: dupe\nmodel: claude-opus-4-6\n---\n' > "$tmp/agents/aaa-dupe.md"
  printf -- '---\nname: dupe\nmodel: claude-opus-5\n---\n' > "$tmp/agents/zzz-dupe.md"

  for fixture in "$tmp"/agents/*.md; do
    printf '%s\n' "$abort_line" >> "$fixture"
  done

  # The prose assertions 4 and 5 read, so a control fixture is only missing what
  # the control is about.
  # Shaped like the real document: the reviewer-facing rules live inside the
  # verbatim prompt blockquote, the writer-facing ones in ordinary prose.
  clause='> open your report with the model name and id you yourself are running as
> if I gave you no model, reply ABORT: writer model not supplied
> if you are my model, reply ABORT: pin failed
Fill in WRITER = your own model id before sending this.
An abort is a result, not an error.'

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
  control 'two definitions claiming one name'            '| Opus 4.6 | `subagent_type: "dupe"` |'
  control 'the writer own model behind a YAML comment'   '| Opus 5 | `subagent_type: "commented"` |'
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

  # Each prose assertion, run against a document missing exactly that one line.
  # Dropping a sentence is how these guards die, so each has to be shown red on
  # its own rather than as a group.
  prose_control() {
    local desc="$1" missing="$2" out rc
    {
      printf '%s\n' '| Opus 5 | `subagent_type: "pinned-old"` |'
      printf '%s\n' "$clause" | grep -vF "$missing"
    } > "$tmp/prose.md"
    out="$(REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/prose.md" AGENTS_DIR="$tmp/agents" bash "$self" 2>&1)"
    rc=$?
    if [[ "$rc" -ne 0 ]]; then
      echo "PASS (control): rejects a document with $desc."
    else
      echo "FAIL (control): accepted a document with $desc -- exit $rc, output: $out"
      fail=1
    fi
  }

  prose_control 'no self-report instruction' 'the model name and id you yourself are running as'
  prose_control 'no abort contract'          'ABORT: pin failed'
  prose_control 'no abort for an unsupplied writer model' 'ABORT: writer model not supplied'
  prose_control 'no writer model to compare against' 'WRITER = your own model id'
  prose_control 'no recovery path for an abort' 'An abort is a result, not an error'

  # A rule that was deleted and left commented above is not a rule. Every
  # sentinel present, every one of them inert.
  {
    printf '%s\n' '| Opus 5 | `subagent_type: "pinned-old"` |'
    printf '%s\n' '<!-- removed, kept for reference:'
    printf '%s\n' "$clause"
    printf '%s\n' '-->'
  } > "$tmp/commented.md"
  if REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/commented.md" AGENTS_DIR="$tmp/agents" bash "$self" >/dev/null 2>&1; then
    echo "FAIL (control): accepted a document whose abort contract is commented out."
    fail=1
  else
    echo "PASS (control): rejects a document whose abort contract is commented out."
  fi

  # The same, one level down: a definition keeping the abort line only inside a
  # comment requires nothing of its reviewer.
  mkdir -p "$tmp/commentedagent"
  printf -- '---\nname: pinned-old\nmodel: claude-opus-4-6\n---\n<!-- ABORT: pin failed -->\n' > "$tmp/commentedagent/pinned-old.md"
  printf '%s\n%s\n' '| Opus 5 | `subagent_type: "pinned-old"` |' "$clause" > "$tmp/fixture.md"
  if REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/fixture.md" AGENTS_DIR="$tmp/commentedagent" bash "$self" >/dev/null 2>&1; then
    echo "FAIL (control): accepted a definition whose abort rule is commented out."
    fail=1
  else
    echo "PASS (control): rejects a definition whose abort rule is commented out."
  fi

  # A definition that does not require the abort check. The whole point of the
  # check is that a retired pin is otherwise silent, so a definition without it
  # is as bad as a definition pinning the writer's own model.
  mkdir -p "$tmp/noabort"
  printf -- '---\nname: pinned-old\nmodel: claude-opus-4-6\n---\n' > "$tmp/noabort/pinned-old.md"
  printf '%s\n%s\n' '| Opus 5 | `subagent_type: "pinned-old"` |' "$clause" > "$tmp/fixture.md"
  if REVIEWER_CHECK_INNER=1 SKILL_MD="$tmp/fixture.md" AGENTS_DIR="$tmp/noabort" bash "$self" >/dev/null 2>&1; then
    echo "FAIL (control): accepted a definition that does not require the abort check."
    fail=1
  else
    echo "PASS (control): rejects a definition that does not require the abort check."
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "One or more reviewer-model assertions failed."
  exit 1
fi

echo "All reviewer-model assertions passed."
