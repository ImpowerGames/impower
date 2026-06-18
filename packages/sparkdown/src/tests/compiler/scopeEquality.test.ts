import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

// ENGINE-EQUALITY GATE.
//
// We ship ONE TextMate grammar JSON to two engines: vscode-textmate (VSCode's
// editor highlighter, which we do NOT control) and textmate-grammar-tree (the
// language server / screenplay-preview decorator / PDF exporter). The point of
// sharing a grammar is that both engines must agree on the interpretation of
// every source position. When they don't, semantic features silently drift
// behind plausible-looking highlighting (the bug this test was created for: a
// trailing `:` on `scene TEASER:` opened a phantom `BlockAction` in the tree
// that vscode never opened, because the tree closed `Scene` `ERROR_INCOMPLETE`
// mid-line and then matched an `^`-anchored rule at a non-line-start).
//
// This test asserts ZERO per-character scope-stack divergence between the two
// engines, and FAILS THE BUILD on any divergence. Because vscode-textmate is
// the reference we ship to users and cannot patch, every divergence is a
// grammar bug to fix in the grammar (see
// packages/sparkdown/docs/compiler/GRAMMAR.md §17).
//
// Coverage = a set of hand-written targeted fixtures (below) + every `.sd`
// fixture already in the snapshot corpus.

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, "__snapshots__/grammar");

// Hand-written fixtures, exercising the cases the task requires: each kind of
// top-level construct, nesting under `scene NAME` with AND without a trailing
// colon, blank-line-separated content, and comment-line-separated content.
// Newlines are explicit `\n` so the fixtures are immune to CRLF checkout.
const TARGETED: Record<string, string> = {
  // --- the reported bug + its whole class (trailing junk on a boundary rule)
  "scene-trailing-colon":
    "scene TEASER:\n\n    $: CLOSEUP - ACE OF SPADES\n\n    BUNNY:\n      Hello.\n",
  "branch-trailing-colon": "branch X:\n  Hello.\n",
  "scene-trailing-junk": "scene main :@!\n  Hello.\n",
  "scene-trailing-comment": "scene main // a note\n  Hello.\n",
  "scene-trailing-annotation": "scene main # tag\n  Hello.\n",

  // --- nesting under `scene NAME`, with and without the trailing colon
  "scene-nested-dialogue":
    "scene main\n\n    BUNNY:\n      Hello.\n\n    ACE:\n      Hi there.\n",
  "scene-colon-nested-dialogue":
    "scene main:\n\n    BUNNY:\n      Hello.\n",

  // --- blank-line-separated content: a LEGITIMATE line-leading colon block,
  // which both engines must open AND hold across the blank line (the exact
  // `end: (?=^(?!$|//|\\1\\s))` behavior the original report worried about).
  "blockaction-blank-lines":
    ":\n    Line one.\n\n    Line two.\n\nnot indented closes it\n",
  "dialogue-blank-lines":
    "BUNNY:\n  Hello there.\n\n  Still talking.\nACTION resumes.\n",

  // --- comment-line-separated content
  "blockaction-comment-lines":
    ":\n    Line one.\n    // a comment line\n    Line two.\nnot indented\n",

  // --- a sampling of other top-level constructs
  "include": "include script.sd\n",
  "front-matter": "---\ntitle: Test\n---\n\nAction line.\n",
  "choice": "scene main\n  + a choice -> END\n  + another -> END\nend\n",
  "if-then-block": "if x > 0 then\n  Positive.\nend\n",
  "if-then-blank-lines": "if x > 0 then\n  Positive.\n\n  More.\nend\n",
  "do-block": "do\n  Inside the block.\nend\n",
  "interpolation": "The value is {x.name} today.\n",
  "knot": "= start\n  Hello.\n  -> END\n",
  "plain-action": "Just a line of action.\n\nAnother paragraph.\n",

  // --- structural-define (style/screen/component) body lines: the
  // classified line-shape rules (scalar / object header / array item /
  // bare marker). Object headers that contain `=` (`> #image^=raffles_:`)
  // must classify as headers, not scalars; scalar values that contain `-`
  // (`= -3px`) must NOT classify as array items. Both are engine-equality
  // hazards for the no-`^` capture sub-rules.
  "struct-scalar-props":
    "style panel with\n  position = absolute\n  font_size = 3.4cqh\nend\n",
  "struct-scalar-dash-value":
    "style panel with\n  margin = -3px\n  aspect_ratio = 4/3\nend\n",
  "struct-object-headers":
    "style dialogue with\n  @screen-size(sm):\n    width = 100%\n  > text:\n    color = black\nend\n",
  "struct-attr-selector-with-equals":
    "style shadow with\n  > #image^=raffles_:\n    background_color = #E5323E\nend\n",
  "struct-bare-markers":
    "screen main with\n  portrait:\n    mask shadow_1\n    image\nend\n",
  "struct-array-items":
    "style list with\n  items:\n    - first\n    - second\nend\n",
  "struct-comment-line":
    "style panel with\n  position = absolute\n  -- background_color = rgba(0,0,0,0.8)\n  font_size = 3.4cqh\nend\n",

  // --- tag body `{...}` interpolations (now their own
  // `LuauInterpolatedStringExpression` nodes inside `TagContent`). Adjacent
  // interpolations + literal runs (`# pic{a}{b}.jpg`), an interpolation
  // mid-body, and a multi-tag line all exercise the no-`^` `TagText` /
  // interpolation interleaving in `TagContent`. Line-start `#` is used so
  // these don't trip a PRE-EXISTING `Tag` capture-1 leading-whitespace
  // divergence (the space before a mid-line `#` already diverges on the
  // unchanged grammar — out of scope for this fix).
  "tag-interpolation": "# pic{amount}{color}.jpg\n",
  "tag-interpolation-midbody": "# a tag {var} more\n",
  "tag-plain-no-interp": "# plain tag no interp\n",
  "tag-multi-with-interp": "# a # b {x}\n",
};

interface Fixture {
  category: string;
  name: string;
  source: string;
}

function loadCorpus(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const category of readdirSync(CORPUS_DIR)) {
    const categoryDir = join(CORPUS_DIR, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir)) {
      if (!file.endsWith(".sd")) continue;
      fixtures.push({
        category,
        name: file.slice(0, -3),
        source: readFileSync(join(categoryDir, file), "utf8"),
      });
    }
  }
  return fixtures;
}

async function assertEqual(source: string) {
  const result = await compareEnginesFull(source);
  expect(
    result.divergences,
    formatDivergences(result.source, result.divergences),
  ).toEqual([]);
}

describe("engine scope-stack equality", () => {
  describe("targeted fixtures", () => {
    for (const [name, source] of Object.entries(TARGETED)) {
      test(name, async () => {
        await assertEqual(source);
      });
    }
  });

  describe("snapshot corpus", () => {
    for (const fixture of loadCorpus()) {
      test(`${fixture.category}/${fixture.name}`, async () => {
        await assertEqual(fixture.source);
      });
    }
  });
});
