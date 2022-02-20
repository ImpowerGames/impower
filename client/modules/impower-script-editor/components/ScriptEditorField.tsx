import { basicSetup, EditorState, EditorView } from "@codemirror/basic-setup";
import { indentWithTab } from "@codemirror/commands";
import { foldAll, unfoldAll } from "@codemirror/fold";
import { HighlightStyle } from "@codemirror/highlight";
import { indentUnit } from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { tooltips } from "@codemirror/tooltip";
import { keymap } from "@codemirror/view";
import React, { useEffect, useRef } from "react";
import { fountain } from "../types/fountain";
import { fountainLanguage, tags as t } from "../types/fountainLanguage";
import { fountainParseLinter } from "../utils/lint";

const colors = {
  invalid: "#FFFFFF",
  constant: "#FFFF00",
  keyword: "#00D0D0",
  parameter: "#BFA4A4",
  operator: "#D0D0D0",

  comment: "#608B4E",
  section: "#FF81FF",
  sceneHeading: "#FF8080",
  transition: "#BEA3A3",
  logic: "#00FF00",
  flow: "#FFFF00",
  titleKey: "#EFC090",
  titleValue: "#BFA4A4",
  character: "#4EC9B0",
  dialogue: "#CE9178",
  dualDialogue: "#79ABFF",
  parenthetical: "#D7BA7D",
  pageBreak: "#606080",
  formatting: "#79ABFF",
};

const myHighlightStyle = HighlightStyle.define([
  {
    tag: t.formatting,
    color: colors.formatting,
    opacity: 0.5,
    fontWeight: 400,
  },
  { tag: t.centered, color: colors.formatting },
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
  {
    tag: t.dialogue,
    color: colors.dialogue,
  },
  {
    tag: t.dualDialogue,
    color: colors.dualDialogue,
  },
  {
    tag: t.parenthetical,
    color: colors.parenthetical,
  },
  {
    tag: t.character,
    color: colors.character,
  },
  { tag: t.section, color: colors.section, opacity: 0.5, fontWeight: 400 },
  { tag: t.sectionHeading1, color: colors.section },
  { tag: t.sectionHeading2, color: colors.section },
  { tag: t.sectionHeading3, color: colors.section },
  { tag: t.sectionHeading4, color: colors.section },
  { tag: t.sectionHeading5, color: colors.section },
  { tag: t.sectionHeading6, color: colors.section },
  {
    tag: t.sceneHeading,
    color: colors.sceneHeading,
  },
  {
    tag: t.sceneNumber,
    opacity: 0.5,
  },
  { tag: t.pageBreak, color: colors.pageBreak },
  { tag: t.transition, color: colors.transition },
  { tag: t.logic, color: colors.logic },
  { tag: t.flow, color: colors.flow },
  {
    tag: t.titleValue,
    color: colors.titleValue,
  },
  {
    tag: t.titleKey,
    color: colors.titleKey,
    fontWeight: 400,
  },
  { tag: t.lyric, fontStyle: "italic" },
  { tag: t.note, color: colors.comment },
  { tag: t.noteMark, color: colors.comment, opacity: 0.5 },
  { tag: t.synopses, color: colors.comment },
  { tag: t.synopsesMark, color: colors.comment, opacity: 0.5 },
  { tag: t.comment, color: colors.comment },
  {
    tag: t.linkTitle,
    color: colors.keyword,
  },
  {
    tag: t.linkLabel,
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
          linter(fountainParseLinter),
          tooltips({ position: "absolute" }),
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
