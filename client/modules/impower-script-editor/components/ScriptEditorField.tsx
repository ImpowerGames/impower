import { basicSetup, EditorState, EditorView } from "@codemirror/basic-setup";
import { indentWithTab } from "@codemirror/commands";
import { foldAll, unfoldAll } from "@codemirror/fold";
import { HighlightStyle } from "@codemirror/highlight";
import { indentUnit } from "@codemirror/language";
import { Diagnostic, linter } from "@codemirror/lint";
import { tooltips } from "@codemirror/tooltip";
import { keymap } from "@codemirror/view";
import React, { useEffect, useRef } from "react";
import {
  FountainParseResult,
  parseFountain,
} from "../../impower-script-parser";
import { fountain } from "../types/fountain";
import { fountainLanguage, tags as t } from "../types/fountainLanguage";

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
  cursor?: {
    fromPos?: number;
    toPos?: number;
    fromLine?: number;
    toLine?: number;
  };
  style?: React.CSSProperties;
  onChange?: (value: string) => void;
  onParse?: (result: FountainParseResult) => void;
  onCursor?: (range: {
    fromPos: number;
    toPos: number;
    fromLine: number;
    toLine: number;
  }) => void;
}

const ScriptEditorField = React.memo(
  (props: ScriptEditorFieldProps): JSX.Element => {
    const {
      defaultValue,
      style,
      toggleFolding,
      cursor,
      onChange,
      onParse,
      onCursor,
    } = props;

    const elementRef = useRef<HTMLDivElement>();
    const viewRef = useRef<EditorView>();
    const cursorRef = useRef<{
      fromPos?: number;
      toPos?: number;
      fromLine?: number;
      toLine?: number;
    }>({});

    useEffect(() => {
      const fountainParseLinter = (view: EditorView): Diagnostic[] => {
        const result = parseFountain(view.state.doc.toString());
        if (onParse) {
          onParse(result);
        }
        return result.diagnostics || [];
      };
      const startState = EditorState.create({
        doc: defaultValue,
        extensions: [
          basicSetup,
          fountain({ base: fountainLanguage }),
          linter(fountainParseLinter, { delay: 10 }),
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
              ".cm-scroller": {
                fontFamily: "Courier Prime Code",
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
            const cursorRange = v.state.selection.main;
            const fromPos = cursorRange.from;
            const toPos = cursorRange.to;
            const fromLine = v.state.doc.lineAt(fromPos)?.number;
            const toLine = v.state.doc.lineAt(toPos)?.number;
            if (
              cursorRef.current.fromLine !== fromLine ||
              cursorRef.current.toLine !== toLine ||
              cursorRef.current.fromPos !== fromPos ||
              cursorRef.current.toPos !== toPos
            ) {
              if (onCursor) {
                onCursor({
                  fromPos,
                  toPos,
                  fromLine,
                  toLine,
                });
              }
            }
            cursorRef.current = {
              fromPos,
              toPos,
              fromLine,
              toLine,
            };
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
    }, [onChange, onCursor, onParse]);

    useEffect(() => {
      if (toggleFolding) {
        foldAll(viewRef.current);
      } else {
        unfoldAll(viewRef.current);
      }
    }, [toggleFolding]);

    useEffect(() => {
      if (viewRef.current && cursor) {
        const from = viewRef.current.state.doc.line(cursor.fromLine)?.from;
        viewRef.current.dispatch({
          selection: { anchor: from },
          effects: EditorView.scrollIntoView(from, { y: "center" }),
        });
      }
    }, [cursor]);

    return (
      <div
        ref={elementRef}
        style={{ flex: 1, display: "flex", flexDirection: "column", ...style }}
      ></div>
    );
  }
);

export default ScriptEditorField;
