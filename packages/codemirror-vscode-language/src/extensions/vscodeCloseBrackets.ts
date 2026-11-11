import { closeBrackets } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Facet,
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

export const autoCloseBrackets =Facet.define<boolean, boolean>({
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

    const pos = sel.head;
    const line = view.state.doc.lineAt(pos);

    const pairs = pairsAt(view.state, pos);
    const pair = longest(
      pairs.filter(({ open, close }) => {
        if (open == null || close == null) return false;

        if (!open.endsWith(insert)) return false;

        const lookBackLength = open.length - insert.length;

        if (pos - line.from < lookBackLength) return false;

        const textBefore = view.state.sliceDoc(pos - lookBackLength, pos);

        return textBefore === open.slice(0, lookBackLength);
      }),
    );

    if (!pair) {
      return false;
    }

    const containedPair = longest(
      pairs.filter(
        ({ open, close }) =>
          open !== pair.open &&
          pair.open.includes(open) &&
          pair.close.endsWith(close),
      ),
    );

    if (pair.notIn) {
      const tags = getAllStyleTags(view.state, pos);
      for (const tag of tags) {
        const name = (tag as any).name;
        if (typeof name === "string") {
          if (pair.notIn.includes(name)) {
            return false;
          }
        }
      }
    }

    const close =
      containedPair &&
      view.state.sliceDoc(pos, line.to).startsWith(containedPair.close)
        ? pair.close.slice(0, pair.close.length - containedPair.close.length)
        : pair.close;

    const tr = view.state.changeByRange((range) => {
      return {
        changes: { from: range.from, to: range.to, insert: insert + close },
        range: EditorSelection.cursor(range.from + insert.length),
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
