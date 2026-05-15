import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Facet,
  Prec,
  combineConfig,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { Tag, getStyleTags } from "@lezer/highlight";

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

export interface VSCodeCloseBracketsConfig {
  autoClosingPairs?: (
    | { open: string; close: string; notIn?: string[] }
    | [string, string]
  )[];
}

export const vscodeCloseBracketsConfig = Facet.define<
  VSCodeCloseBracketsConfig,
  Required<VSCodeCloseBracketsConfig>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const vscodeCloseBracketsInputHandler = EditorView.inputHandler.of(
  (view, from, to, insert) => {
    const config = view.state.facet(vscodeCloseBracketsConfig);
    if (
      (android ? view.composing : view.compositionStarted) ||
      view.state.readOnly
    ) {
      return false;
    }
    let sel = view.state.selection.main;

    // We remove the insert.length > 2 check here, because a user might paste
    // a multi-character string that completes an open bracket.
    if (from != sel.from || to != sel.to) {
      return false;
    }

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);

    const autoClosingPairRule = config?.autoClosingPairs?.find((rule) => {
      const open = Array.isArray(rule) ? rule[0] : rule.open;
      const close = Array.isArray(rule) ? rule[1] : rule.close;
      //  Is the rule valid?
      if (open == null || close == null) return false;

      //  Does the typed text finish this open rule?
      if (!open.endsWith(insert)) return false;

      //  How far back do we need to check?
      const lookBackLength = open.length - insert.length;

      // If there isn't enough text before the cursor on this line, skip it.
      if (pos - line.from < lookBackLength) return false;

      //  Get the text strictly before the cursor
      const textBefore = view.state.sliceDoc(pos - lookBackLength, pos);

      //  Does the text before match the start of the rule?
      return textBefore === open.slice(0, lookBackLength);
    });

    if (!autoClosingPairRule) {
      return false;
    }

    const notIn = Array.isArray(autoClosingPairRule)
      ? undefined
      : autoClosingPairRule.notIn;
    if (notIn) {
      const tags = getAllStyleTags(view.state, pos);
      for (const tag of tags) {
        const name = (tag as any).name;
        if (typeof name === "string") {
          if (notIn.includes(name)) {
            return false;
          }
        }
      }
    }

    const close = Array.isArray(autoClosingPairRule)
      ? autoClosingPairRule[1]
      : autoClosingPairRule.close;

    if (typeof close !== "string") {
      return false;
    }

    // Create a transaction that inserts the typed text AND the close bracket,
    // placing the cursor perfectly between them.
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
  },
);

export function vscodeCloseBrackets(
  config: VSCodeCloseBracketsConfig = {},
): Extension {
  return [
    closeBracketsState,
    vscodeCloseBracketsConfig.of(config),
    vscodeCloseBracketsInputHandler,
    Prec.high(keymap.of([...closeBracketsKeymap])),
  ];
}
