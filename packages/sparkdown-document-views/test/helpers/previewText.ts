// Reduce the CodeMirror screenplay preview to a normalized "visible text"
// string matching the format produced by pdfText.ts.
//
// Critical design rule: we extract by walking source characters, NOT by
// walking known block nodes. The preview shows EVERY character in the source
// that isn't covered by a hide decoration — including stray characters
// between known nodes (like a stray > BREAK marker). A node-walking extractor
// would silently swallow those, hiding the very bugs we're trying to find.
//
// Algorithm:
//   1. Parse source into a syntax tree (sync, via the textmate parser).
//   2. Construct a no-language EditorState wrapping the doc (decorate() only
//      uses state.doc / state.sliceDoc; the language facet is irrelevant
//      once we pass the tree in via treeOverride).
//   3. Call decorate(state, 0, undefined, tree) -> Range<Decoration>[].
//   4. Identify "hide" decorations (Decoration.replace, with or without
//      widget — widgets replace the source range with their own DOM).
//   5. Walk each line of source. Subtract hidden ranges intersecting that
//      line. If anything remains, look up the enclosing block kind in the
//      tree at the line's starting position and emit `<kind> visible`.

import { ensureSyntaxTree, language, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import type { Tree } from "@lezer/common";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  decorate,
} from "../../src/modules/screenplay-preview/utils/screenplayFormatting";

type HideInterval = { from: number; to: number };

const PARSE_TIMEOUT_MS = 30_000;

// Build state with language facet via language.of() (Language.extension
// getter doesn't activate the facet correctly in this test environment).
const parseSource = (source: string): { state: EditorState; tree: Tree } => {
  const state = EditorState.create({
    doc: source,
    extensions: [language.of(SCREENPLAY_LANGUAGE_SUPPORT.language)],
  });
  ensureSyntaxTree(state, source.length, PARSE_TIMEOUT_MS);
  const tree = syntaxTree(state);
  return { state, tree };
};

const collectHiddenRanges = (
  ranges: Range<Decoration>[],
): HideInterval[] => {
  const hides: HideInterval[] = [];
  for (const r of ranges) {
    if (r.from >= r.to) continue;
    const spec: any = (r.value as any).spec;
    if (!spec) continue;
    // Mark decorations have a `class` or `attributes` and don't replace text.
    // Line decorations carry `class` / `attributes` but apply to the line
    // (CodeMirror enforces from==to for them, so the `from >= to` check above
    // already filters them out).
    // Replace decorations may or may not have a widget; both hide source text.
    const isReplace =
      spec.widget !== undefined ||
      spec.block === true ||
      // a bare Decoration.replace({}) sets spec to {} — distinguishable from
      // mark because mark would have class/attributes; if there's nothing
      // we treat as replace.
      (spec.class === undefined &&
        spec.attributes === undefined &&
        spec.tagName === undefined);
    if (isReplace) {
      hides.push({ from: r.from, to: r.to });
    }
  }
  hides.sort((a, b) => a.from - b.from);
  const merged: HideInterval[] = [];
  for (const h of hides) {
    const last = merged[merged.length - 1];
    if (last && h.from <= last.to) {
      last.to = Math.max(last.to, h.to);
    } else {
      merged.push({ ...h });
    }
  }
  return merged;
};

const sliceVisible = (
  source: string,
  from: number,
  to: number,
  hides: HideInterval[],
): string => {
  let out = "";
  let cur = from;
  for (const h of hides) {
    if (h.to <= cur) continue;
    if (h.from >= to) break;
    const visibleEnd = Math.min(h.from, to);
    if (visibleEnd > cur) out += source.slice(cur, visibleEnd);
    cur = Math.max(cur, h.to);
    if (cur >= to) break;
  }
  if (cur < to) out += source.slice(cur, to);
  return out;
};

// Walk up the tree at position `pos` to find the enclosing block. Returns a
// label that matches what pdfText.ts emits for the same content.
const blockKindAt = (tree: Tree, pos: number): string => {
  const ancestors: string[] = [];
  let node: any = tree.resolve(pos, 1);
  while (node) {
    ancestors.push(node.name);
    node = node.parent;
  }
  const has = (n: string) => ancestors.includes(n);
  // Innermost specific markers first
  if (has("ParentheticalLineContent")) return "parenthetical";
  if (has("DialogueCharacter") || has("DialogueCharacterName")) return "character";
  // Then block kinds
  if (has("BlockHeading") || has("InlineHeading")) return "scene_heading";
  if (has("BlockTransitional") || has("InlineTransitional")) return "transitional";
  if (has("BlockTitle") || has("InlineTitle")) return "centered_title";
  if (has("Choice")) return "choice";
  if (has("BlockDialogue") || has("InlineDialogue")) return "dialogue";
  if (has("BlockAction") || has("InlineAction") || has("ImplicitAction"))
    return "action";
  return "unknown";
};

export const extractPreviewText = (source: string): string => {
  const { state, tree } = parseSource(source);
  const decorations = decorate(state, 0, undefined, tree);
  const hides = collectHiddenRanges(decorations);

  const lines: string[] = [];
  let pos = 0;
  let lastBlank = false;
  while (pos <= source.length) {
    const newlineIdx = source.indexOf("\n", pos);
    const lineEnd = newlineIdx === -1 ? source.length : newlineIdx;
    const visible = sliceVisible(source, pos, lineEnd, hides);
    const trimmed = visible.replace(/\r/g, "").trimEnd();
    if (trimmed) {
      const kind = blockKindAt(tree, pos);
      lines.push(`<${kind}> ${trimmed}`);
      lastBlank = false;
    } else {
      // Blank line acts as a separator; collapse consecutive blanks.
      if (!lastBlank && lines.length > 0) {
        lines.push("");
        lastBlank = true;
      }
    }
    if (newlineIdx === -1) break;
    pos = newlineIdx + 1;
  }
  // Trim trailing blank
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
};
