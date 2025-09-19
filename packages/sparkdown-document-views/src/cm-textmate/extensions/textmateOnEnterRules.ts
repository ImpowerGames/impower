import {
  acceptCompletion,
  closeBracketsKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import { getIndentUnit, indentString } from "@codemirror/language";
import { EditorSelection, Facet, Prec, combineConfig } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

const INDENT_REGEX = /([ \t]*)/;

export interface TextmateOnEnterRulesConfig {
  onEnterRules?: {
    beforeText: string;
    afterText?: string;
    previousLineText?: string;
    action: {
      indent: string;
      appendText?: string;
      deleteText?: string;
      removeText?: number;
    };
  }[];
}

export const textmateOnEnterRulesConfig = Facet.define<
  TextmateOnEnterRulesConfig,
  Required<TextmateOnEnterRulesConfig>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

export const onEnterRulesCommand =
  () =>
  (view: EditorView): boolean => {
    const config = view.state.facet(textmateOnEnterRulesConfig);
    const onEnterRules = config.onEnterRules;

    const { state, dispatch } = view;

    const { doc } = state;
    let triggeredRule = undefined;
    const changes = state.changeByRange((range) => {
      const pos = range.from;
      const beforeLine = doc.lineAt(pos);
      if (!onEnterRules || state.selection.ranges.length !== 1) {
        return { range };
      }
      const selectionFrom = state.selection.main.from;
      const selectionTo = state.selection.main.to;
      const afterTextLine = doc.lineAt(selectionTo);
      const beforeText = state.sliceDoc(beforeLine.from, selectionFrom);
      const afterText = state.sliceDoc(
        selectionTo,
        afterTextLine.from + afterTextLine.text.length
      );
      const previousLineText =
        beforeLine.number > 1 ? doc.line(beforeLine.number - 1)?.text : "";
      const currentIndentSize =
        beforeLine.text.match(INDENT_REGEX)?.[0].length ?? 0;
      const decreasedIndentSize = currentIndentSize - getIndentUnit(state);
      const increasedIndentSize = currentIndentSize + getIndentUnit(state);
      let cursorOffset = 0;
      for (let i = 0; i < onEnterRules.length; i += 1) {
        const onEnterRule = onEnterRules[i]!;
        const beforeTextRegex = onEnterRule.beforeText
          ? new RegExp(onEnterRule.beforeText, "u")
          : undefined;
        const afterTextRegex = onEnterRule.afterText
          ? new RegExp(onEnterRule.afterText, "u")
          : undefined;
        const previousLineTextRegex = onEnterRule.previousLineText
          ? new RegExp(onEnterRule.previousLineText, "u")
          : undefined;
        if (beforeTextRegex && !beforeTextRegex.test(beforeText)) {
          continue;
        }
        if (afterTextRegex && !afterTextRegex.test(afterText)) {
          continue;
        }
        if (
          previousLineTextRegex &&
          !previousLineTextRegex.test(previousLineText)
        ) {
          continue;
        }
        triggeredRule = onEnterRule;
        let indent = indentString(state, currentIndentSize);
        if (onEnterRule.action.indent === "none") {
          indent = indentString(state, currentIndentSize);
        }
        if (onEnterRule.action.indent === "indent") {
          indent = indentString(state, increasedIndentSize);
        }
        if (onEnterRule.action.indent === "outdent") {
          indent = indentString(state, decreasedIndentSize);
        }
        if (onEnterRule.action.indent === "indentOutdent") {
          const afterIndent =
            state.lineBreak + indentString(state, currentIndentSize);
          indent = indentString(state, increasedIndentSize) + afterIndent;
          cursorOffset = -afterIndent.length;
        }
        if (
          onEnterRule.action.deleteText &&
          beforeText.endsWith(onEnterRule.action.deleteText) &&
          range.empty
        ) {
          return {
            range: EditorSelection.cursor(
              pos - onEnterRule.action.deleteText.length + cursorOffset
            ),
            changes: [
              {
                from: beforeLine.to - onEnterRule.action.deleteText.length,
                to: beforeLine.to,
                insert: "",
              },
            ],
          };
        } else if (onEnterRule.action.appendText && range.empty) {
          const insert =
            state.lineBreak + indent + onEnterRule.action.appendText;
          return {
            range: EditorSelection.cursor(pos + insert.length + cursorOffset),
            changes: [
              {
                from: pos,
                to: pos,
                insert,
              },
            ],
          };
        } else {
          const preChanges = [];
          if (!range.empty) {
            preChanges.push({
              from: range.from,
              to: range.to,
              insert: "",
            });
          }
          const insert = state.lineBreak + indent;
          return {
            range: EditorSelection.cursor(pos + insert.length + cursorOffset),
            changes: [
              ...preChanges,
              {
                from: pos,
                to: pos,
                insert,
              },
            ],
          };
        }
      }
      return { range };
    });

    if (triggeredRule) {
      acceptCompletion(view);
      dispatch(state.update(changes, { userEvent: "input" }));
      startCompletion(view);
      return true;
    }

    const defaultChanges = state.changeByRange((range) => {
      const pos = range.from;
      const insert = state.lineBreak;
      return {
        range: EditorSelection.cursor(pos + insert.length),
        changes: [
          {
            from: pos,
            to: pos,
            insert,
          },
        ],
      };
    });
    acceptCompletion(view);
    dispatch(state.update(defaultChanges, { userEvent: "input" }));
    startCompletion(view);
    return true;
  };

export const textmateOnEnterRules = (
  config: TextmateOnEnterRulesConfig = {}
) => [
  textmateOnEnterRulesConfig.of(config),
  Prec.high(
    keymap.of([
      {
        key: "Enter",
        run: onEnterRulesCommand(),
      },
      ...closeBracketsKeymap,
    ])
  ),
];
