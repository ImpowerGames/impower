import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import type { Tree } from "@lezer/common";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  decorate,
} from "../../src/modules/screenplay-preview/utils/screenplayFormatting";
import { completeTree } from "./parseSettle";

type HideInterval = { from: number; to: number };

const parseSource = (source: string): { state: EditorState; tree: Tree } => {
  const state = EditorState.create({
    doc: source,
    extensions: [language.of(SCREENPLAY_LANGUAGE_SUPPORT.language)],
  });
  return { state, tree: completeTree(state) };
};

const collectHiddenRanges = (
  ranges: Range<Decoration>[],
): HideInterval[] => {
  const hides: HideInterval[] = [];
  for (const r of ranges) {
    if (r.from >= r.to) continue;
    const spec: any = (r.value as any).spec;
    if (!spec) continue;
    const isReplace =
      spec.widget !== undefined ||
      spec.block === true ||
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

const blockKindAt = (tree: Tree, pos: number): string => {
  const ancestors: string[] = [];
  let node: any = tree.resolve(pos, 1);
  while (node) {
    ancestors.push(node.name);
    node = node.parent;
  }
  const has = (n: string) => ancestors.includes(n);
  if (has("ParentheticalLineContent")) return "parenthetical";
  if (has("DialogueCharacter") || has("DialogueCharacterName")) return "character";
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
      if (!lastBlank && lines.length > 0) {
        lines.push("");
        lastBlank = true;
      }
    }
    if (newlineIdx === -1) break;
    pos = newlineIdx + 1;
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
};
