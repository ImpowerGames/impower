import { getIndentUnit, indentString } from "@codemirror/language";
import { EditorSelection, Facet, Prec, combineConfig } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

const INDENT_REGEX = /([ \t]*)/;

export interface VSCodeOnEnterRulesConfig<T = string> {
  onEnterRules?: {
    beforeText: T;
    afterText?: T;
    previousLineText?: T;
    action: {
      indent: string;
      appendText?: string;
      deleteText?: string;
      removeText?: number;
    };
  }[];
}

export const vscodeOnEnterRulesConfig = Facet.define<
  VSCodeOnEnterRulesConfig<RegExp>,
  Required<VSCodeOnEnterRulesConfig<RegExp>>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

export function onEnterRulesCommand(view: EditorView) {
  const state = view.state;

  // 4. Get the configured onEnterRules
  const config = state.facet(vscodeOnEnterRulesConfig);
  const onEnterRules = config.onEnterRules;

  // 5. Evaluate the rules against the state BEFORE the transaction occurred
  const doc = state.doc;
  let triggeredRule = undefined;
  const modifiedTransactionSpec = state.changeByRange((range) => {
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
      afterTextLine.from + afterTextLine.text.length,
    );
    const previousLineText =
      beforeLine.number > 1 ? doc.line(beforeLine.number - 1)?.text : "";
    const currentIndentSize =
      beforeLine.text.match(INDENT_REGEX)?.[0].length ?? 0;
    const decreasedIndentSize = currentIndentSize - getIndentUnit(state);
    const increasedIndentSize = currentIndentSize + getIndentUnit(state);
    let cursorOffset = 0;
    for (const onEnterRule of onEnterRules) {
      if (onEnterRule.beforeText && !onEnterRule.beforeText.test(beforeText)) {
        continue;
      }
      if (onEnterRule.afterText && !onEnterRule.afterText.test(afterText)) {
        continue;
      }
      if (
        onEnterRule.previousLineText &&
        !onEnterRule.previousLineText.test(previousLineText)
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
            pos - onEnterRule.action.deleteText.length + cursorOffset,
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
        const insert = state.lineBreak + indent + onEnterRule.action.appendText;
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
    view.dispatch(
      state.update(modifiedTransactionSpec, { userEvent: "input.type" }),
    );
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
  view.dispatch(state.update(defaultChanges, { userEvent: "input.type" }));
  return true;
}

export const vscodeOnEnterRules = (
  config: VSCodeOnEnterRulesConfig<string | RegExp> = {},
) => {
  const regexConfig = structuredClone(config);
  if (regexConfig.onEnterRules) {
    for (const onEnterRule of regexConfig.onEnterRules) {
      if (typeof onEnterRule.beforeText === "string") {
        onEnterRule.beforeText = new RegExp(onEnterRule.beforeText, "u");
      }
      if (typeof onEnterRule.afterText === "string") {
        onEnterRule.afterText = new RegExp(onEnterRule.afterText, "u");
      }
      if (typeof onEnterRule.previousLineText === "string") {
        onEnterRule.previousLineText = new RegExp(
          onEnterRule.previousLineText,
          "u",
        );
      }
    }
  }
  return [
    vscodeOnEnterRulesConfig.of(
      regexConfig as VSCodeOnEnterRulesConfig<RegExp>,
    ),
    Prec.high(
      keymap.of([
        {
          key: "Enter",
          run: onEnterRulesCommand,
        },
      ]),
    ),
  ];
};
