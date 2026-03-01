import {
  closeBrackets,
  closeBracketsKeymap,
  insertBracket,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import {
  codePointAt,
  codePointSize,
  combineConfig,
  type Extension,
  Facet,
  Prec,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

const android =
  typeof navigator == "object" && /Android\b/.test(navigator.userAgent);

const closeBracketsState = (closeBrackets() as Extension[])[1]!;

export interface VSCodeCloseBracketsConfig {
  autoClosingPairs?: { open: string; close: string; notIn?: string[] }[];
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
      (v) => v.open === insert,
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
