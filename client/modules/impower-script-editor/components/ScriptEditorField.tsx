import { basicSetup, EditorState, EditorView } from "@codemirror/basic-setup";
import { indentWithTab } from "@codemirror/commands";
import { foldAll, unfoldAll } from "@codemirror/fold";
import { HighlightStyle, tags as t } from "@codemirror/highlight";
import { indentUnit } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import React, { useEffect, useRef } from "react";
import { fountain } from "../types/fountain";
import { fountainLanguage } from "../types/fountainLanguage";

const colors = {
  filter: "#606080",
  comment: "#00E000",
  javadoc: "#CCDF32",
  class: "#FF8080",
  interface: "#D197D9",
  constant: "#FFFF00",
  string: "#DC78DC",
  operator: "#D0D0D0",
  keyword: "#00D0D0",
  variable: "#79ABFF",
  field: "#BED6FF",
  static: "#EFC090",
  parameter: "#BFA4A4",
  invalid: "#FFFFFF",
  line: "#2B91AF",
};

const myHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: colors.keyword },
  {
    tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName],
    color: colors.variable,
  },
  {
    tag: [t.function(t.variableName), t.labelName],
    color: colors.parameter,
  },
  {
    tag: [t.color, t.constant(t.name), t.standard(t.name)],
    color: colors.constant,
  },
  { tag: [t.definition(t.name), t.separator], color: colors.field },
  {
    tag: [
      t.typeName,
      t.number,
      t.changed,
      t.annotation,
      t.modifier,
      t.self,
      t.namespace,
    ],
    color: colors.static,
  },
  {
    tag: [
      t.operator,
      t.operatorKeyword,
      t.url,
      t.escape,
      t.regexp,
      t.link,
      t.special(t.string),
    ],
    color: colors.operator,
  },
  { tag: t.comment, color: colors.comment },
  { tag: t.quote, color: colors.variable },
  { tag: t.strong, color: colors.variable, fontWeight: "bold" },
  { tag: t.emphasis, color: colors.variable, fontStyle: "italic" },
  {
    tag: t.strikethrough,
    color: colors.variable,
    textDecoration: "line-through",
  },
  {
    tag: t.link,
    color: colors.variable,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  { tag: t.heading, color: colors.string, opacity: 0.5, fontWeight: 400 },
  { tag: t.heading1, color: colors.string, fontWeight: "bold" },
  { tag: t.heading2, color: colors.string, fontWeight: "bold" },
  { tag: t.heading3, color: colors.string, fontWeight: "bold" },
  { tag: t.heading4, color: colors.string, fontWeight: "bold" },
  { tag: t.heading5, color: colors.string, fontWeight: "bold" },
  { tag: t.heading6, color: colors.string, fontWeight: "bold" },
  {
    tag: t.className,
    color: colors.interface,
  },
  { tag: t.contentSeparator, color: colors.filter },
  { tag: t.controlKeyword, color: colors.class },
  { tag: t.controlOperator, color: colors.class, opacity: 0.5 },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: colors.constant },
  {
    tag: [t.string, t.inserted],
    color: colors.keyword,
  },
  {
    tag: t.processingInstruction,
    color: colors.variable,
    opacity: 0.5,
    fontWeight: 400,
  },
  {
    tag: t.documentMeta,
    color: colors.parameter,
  },
  {
    tag: t.meta,
    color: colors.static,
    fontWeight: 400,
  },
  { tag: t.invalid, color: colors.invalid },
]);

interface ScriptEditorFieldProps {
  defaultValue: string;
  toggleFolding: boolean;
  style?: React.CSSProperties;
  onChange: (value: string) => void;
}

const ScriptEditorField = React.memo(
  (props: ScriptEditorFieldProps): JSX.Element => {
    const { defaultValue, style, toggleFolding, onChange } = props;

    const elementRef = useRef<HTMLDivElement>();
    const viewRef = useRef<EditorView>();

    useEffect(() => {
      const startState = EditorState.create({
        doc: defaultValue,
        extensions: [
          basicSetup,
          fountain({ base: fountainLanguage }),
          myHighlightStyle,
          keymap.of([indentWithTab]),
          indentUnit.of("    "),
          EditorView.theme(
            {
              "&": {
                color: "white",
                backgroundColor: "#0000004D",
                flex: 1,
              },
              ".cm-content": {
                caretColor: "white",
              },
              "&.cm-focused .cm-cursor": {
                borderLeftColor: "white",
              },
              ".cm-gutters": {
                backgroundColor: "#00000066",
                color: "#ddd",
                border: "none",
              },
              ".cm-activeLine": {
                backgroundColor: "#FFFFFF0F",
              },
            },
            { dark: true }
          ),
          EditorView.lineWrapping,
          EditorView.updateListener.of((v) => {
            if (v.docChanged) {
              if (onChange) {
                onChange(viewRef.current.state.doc.toJSON().join("\n"));
              }
            }
          }),
        ],
      });
      viewRef.current = new EditorView({
        state: startState,
        parent: elementRef.current,
      });
      return (): void => {
        if (viewRef.current) {
          viewRef.current.destroy();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onChange]);

    useEffect(() => {
      if (toggleFolding) {
        foldAll(viewRef.current);
      } else {
        unfoldAll(viewRef.current);
      }
    }, [toggleFolding]);

    return (
      <div
        ref={elementRef}
        style={{ flex: 1, display: "flex", flexDirection: "column", ...style }}
      ></div>
    );
  }
);

export default ScriptEditorField;
