import { closeBrackets, insertBracket } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import {
  codePointAt,
  codePointSize,
  type Extension,
  Facet,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { combineConfig } from "@codemirror/state";

const android =
  typeof navigator == "object" && /Android\b/.test(navigator.userAgent);

const closeBracketsState = (closeBrackets() as Extension[])[1]!;

export interface TextmateCloseBracketsConfig {
  autoClosingPairs?: { open: string; close: string; notIn?: string[] }[];
}

export const textmateCloseBracketsConfig = Facet.define<
  TextmateCloseBracketsConfig,
  Required<TextmateCloseBracketsConfig>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const textmateCloseBracketsInputHandler = EditorView.inputHandler.of(
  (view, from, to, insert) => {
    const config = view.state.facet(textmateCloseBracketsConfig);
    if (
      (android ? view.composing : view.compositionStarted) ||
      view.state.readOnly
    ) {
      return false;
    }
    let sel = view.state.selection.main;
    if (
      insert.length > 2 ||
      (insert.length == 2 && codePointSize(codePointAt(insert, 0)) == 1) ||
      from != sel.from ||
      to != sel.to
    ) {
      return false;
    }
    const pos = view.state.selection.main.head;
    const autoClosingPairRule = config?.autoClosingPairs?.find(
      (v) => v.open === insert
    );
    if (autoClosingPairRule) {
      let nodes = syntaxTree(view.state).resolveStack(pos);
      for (let cur: typeof nodes | null = nodes; cur; cur = cur.next) {
        let { node } = cur;
        if (autoClosingPairRule?.notIn?.includes(node.type.name)) {
          return false;
        }
      }
    }
    let tr = insertBracket(view.state, insert);
    if (!tr) {
      return false;
    }
    view.dispatch(tr);
    return true;
  }
);

export function textmateCloseBrackets(
  config: TextmateCloseBracketsConfig = {}
): Extension {
  return [
    closeBracketsState,
    textmateCloseBracketsConfig.of(config),
    textmateCloseBracketsInputHandler,
  ];
}
