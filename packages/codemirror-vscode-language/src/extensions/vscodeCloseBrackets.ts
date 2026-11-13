import { closeBrackets } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Facet,
  MapMode,
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { Tag, getStyleTags } from "@lezer/highlight";
import { type LanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { configOf, languageAt } from "../utils/languageAt";

export const getAllStyleTags = (state: EditorState, pos: number): Tag[] => {
  const tree = syntaxTree(state);
  let currentNode: SyntaxNode | null = tree.resolveInner(pos, -1);
  const tags = [];
  while (currentNode) {
    const styleTags = getStyleTags(currentNode)?.tags;
    if (styleTags) {
      tags.push(...styleTags);
    }
    currentNode = currentNode.parent;
  }
  return tags;
};

const android =
  typeof navigator == "object" && /Android\b/.test(navigator.userAgent);

const closeBracketsState = (closeBrackets() as Extension[])[1]!;

type AutoClosingPair = NonNullable<
  VSCodeConfigDefinition["autoClosingPairs"]
>[number];

type CloseBracketsData = NonNullable<CodeMirrorLanguageData["closeBrackets"]>;

const closeBracketsDataOf = (
  pairs: readonly AutoClosingPair[],
): CloseBracketsData => ({
  brackets: pairs.map(({ open }) => open),
  before: pairs.map(({ close }) => close).join(""),
});

const longest = (pairs: readonly AutoClosingPair[]) =>
  pairs.reduce<AutoClosingPair | undefined>(
    (result, pair) =>
      !result || pair.open.length > result.open.length ? pair : result,
    undefined,
  );

const DEFAULT_WORD_SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

const isWordChar = (ch: string) =>
  ch !== "" && !/\s/.test(ch) && !DEFAULT_WORD_SEPARATORS.includes(ch);

const isBeforeClosingPair = (
  pairs: readonly AutoClosingPair[],
  lineAfter: string,
) =>
  !pairs.some(({ open }) => open && lineAfter.startsWith(open)) &&
  pairs.some(({ close }) => close && lineAfter.startsWith(close));

const autoClosedEffect = StateEffect.define<number>({
  map: (value, mapping) => mapping.mapPos(value, -1, MapMode.TrackAfter) ?? undefined,
});

const autoClosedMarker = new (class extends RangeValue {})();
autoClosedMarker.startSide = 1;
autoClosedMarker.endSide = -1;

const autoClosedState = StateField.define<RangeSet<typeof autoClosedMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    if (tr.selection) {
      const lineStart = tr.state.doc.lineAt(tr.selection.main.head).from;
      const prevLineStart = tr.startState.doc.lineAt(
        tr.startState.selection.main.head,
      ).from;
      if (lineStart != tr.changes.mapPos(prevLineStart, -1)) {
        value = RangeSet.empty;
      }
    }
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(autoClosedEffect)) {
        value = value.update({
          add: [autoClosedMarker.range(effect.value, effect.value + 1)],
        });
      }
    }
    if (tr.selection) {
      const heads = tr.state.selection.ranges.map((range) => range.head);
      value = value.update({
        filter: (from) => heads.some((head) => head <= from),
      });
    }
    return value;
  },
});

export const autoCloseBrackets = Facet.define<boolean, boolean>({
  combine: (values) => values.at(-1) ?? true,
});

export function vscodeCloseBrackets(
  reader: LanguageReader,
  documentLanguage: string,
  configs: Readonly<Record<string, VSCodeConfigDefinition>>,
): Extension {
  const pairsAt = (state: EditorState, pos: number) =>
    configOf(configs, languageAt(reader, state, pos, documentLanguage), documentLanguage)
      ?.autoClosingPairs ?? [];

  const closeAt = (
    state: EditorState,
    pos: number,
    insert: string,
  ): string | null => {
    const line = state.doc.lineAt(pos);
    const pairs = pairsAt(state, pos);
    const pair = longest(
      pairs.filter(({ open, close }) => {
        if (open == null || close == null) return false;

        if (!open.endsWith(insert)) return false;

        const lookBackLength = open.length - insert.length;

        if (pos - line.from < lookBackLength) return false;

        const textBefore = state.sliceDoc(pos - lookBackLength, pos);

        return textBefore === open.slice(0, lookBackLength);
      }),
    );

    if (!pair) {
      return null;
    }

    if (pair.notIn) {
      for (const tag of getAllStyleTags(state, pos)) {
        const name = (tag as any).name;
        if (typeof name === "string" && pair.notIn.includes(name)) {
          return null;
        }
      }
    }

    const containedPair = longest(
      pairs.filter(
        ({ open, close }) =>
          open !== pair.open &&
          pair.open.includes(open) &&
          pair.close.endsWith(close),
      ),
    );

    const lineAfter = state.sliceDoc(pos, line.to);
    if (
      lineAfter &&
      !isBeforeClosingPair(pairs, lineAfter) &&
      !(autoCloseBeforeAt(state, pos) ?? "").includes(lineAfter[0]!)
    ) {
      return null;
    }

    if (
      pair.open.length === 1 &&
      (insert === '"' || insert === "'") &&
      pos > line.from &&
      isWordChar(state.sliceDoc(pos - 1, pos))
    ) {
      return null;
    }

    return containedPair && lineAfter.startsWith(containedPair.close)
      ? pair.close.slice(0, pair.close.length - containedPair.close.length)
      : pair.close;
  };

  const autoCloseBeforeAt = (state: EditorState, pos: number) =>
    configOf(configs, languageAt(reader, state, pos, documentLanguage), documentLanguage)
      ?.autoCloseBefore;

  const overtypes = (state: EditorState, pos: number, insert: string) => {
    if (insert.length !== 1 || state.sliceDoc(pos, pos + 1) !== insert) {
      return false;
    }
    let found = false;
    state.field(autoClosedState).between(pos, pos + 1, (from) => {
      if (from === pos) found = true;
    });
    return found && pairsAt(state, pos).some(({ close }) => close === insert);
  };

  const inputHandler = EditorView.inputHandler.of((view, from, to, insert) => {
    if (
      (android ? view.composing : view.compositionStarted) ||
      view.state.readOnly ||
      !view.state.facet(autoCloseBrackets)
    ) {
      return false;
    }
    const sel = view.state.selection.main;

    if (from != sel.from || to != sel.to) {
      return false;
    }

    const state = view.state;
    if (state.selection.ranges.some((range) => !range.empty)) {
      return false;
    }

    const actions = state.selection.ranges.map((range) =>
      overtypes(state, range.from, insert)
        ? true
        : closeAt(state, range.from, insert),
    );

    if (actions.every((action) => action === null)) {
      return false;
    }

    let index = 0;
    const tr = state.changeByRange((range) => {
      const action = actions[index++] ?? null;
      const at = range.from + insert.length;
      if (action === true) {
        return { range: EditorSelection.cursor(at) };
      }
      const close = action ?? "";
      return {
        changes: { from: range.from, to: range.to, insert: insert + close },
        range: EditorSelection.cursor(at),
        effects:
          close.length === 1
            ? autoClosedEffect.of(at)
            : [],
      };
    });

    view.dispatch(
      view.state.update(tr, {
        userEvent: "input.type",
        scrollIntoView: true,
      }),
    );

    return true;
  });

  return [
    closeBracketsState,
    autoClosedState,
    EditorState.languageData.of((state, pos) => [
      {
        get closeBrackets() {
          return closeBracketsDataOf(pairsAt(state, pos));
        },
      },
    ]),
    inputHandler,
  ];
}
