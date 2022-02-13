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
  invalid: "#FFFFFF",
  comment: "#00E000",
  constant: "#FFFF00",
  keyword: "#00D0D0",
  parameter: "#BFA4A4",
  operator: "#D0D0D0",

  heading: "#FF81FF",
  sceneHeading: "#FF8080",
  transition: "#BEA3A3",
  titleKey: "#EFC090",
  titleValue: "#BFA4A4",
  character: "#4EC9B0",
  dialogue: "#CE9178",
  parenthetical: "#D7BA7D",
  pageBreak: "#606080",
  formatting: "#79ABFF",
};

const myHighlightStyle = HighlightStyle.define([
  {
    tag: t.processingInstruction,
    color: colors.formatting,
    opacity: 0.5,
    fontWeight: 400,
  },
  { tag: t.quote, color: colors.formatting },
  { tag: t.strong, color: colors.formatting, fontWeight: "bold" },
  { tag: t.emphasis, color: colors.formatting, fontStyle: "italic" },
  {
    tag: t.link,
    color: colors.formatting,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  {
    tag: t.strikethrough,
    color: colors.formatting,
    textDecoration: "line-through",
  },
  { tag: t.comment, color: colors.comment },
  {
    tag: t.typeName,
    color: colors.dialogue,
  },
  {
    tag: t.tagName,
    color: colors.parenthetical,
  },
  {
    tag: t.className,
    color: colors.character,
  },
  { tag: t.heading, color: colors.heading, opacity: 0.5, fontWeight: 400 },
  { tag: t.heading1, color: colors.heading },
  { tag: t.heading2, color: colors.heading },
  { tag: t.heading3, color: colors.heading },
  { tag: t.heading4, color: colors.heading },
  { tag: t.heading5, color: colors.heading },
  { tag: t.heading6, color: colors.heading },
  {
    tag: t.propertyName,
    color: colors.sceneHeading,
  },
  { tag: t.contentSeparator, color: colors.pageBreak },
  { tag: t.controlKeyword, color: colors.transition },
  { tag: t.controlOperator, color: colors.transition, opacity: 0.5 },
  {
    tag: t.documentMeta,
    color: colors.titleValue,
  },
  {
    tag: t.meta,
    color: colors.titleKey,
    fontWeight: 400,
  },
  { tag: t.atom, color: colors.constant },
  {
    tag: t.string,
    color: colors.keyword,
  },
  {
    tag: t.labelName,
    color: colors.parameter,
  },
  {
    tag: t.url,
    color: colors.operator,
  },
  {
    tag: t.escape,
    color: colors.operator,
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
