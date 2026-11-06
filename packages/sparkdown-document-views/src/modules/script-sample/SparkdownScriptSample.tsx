import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import { useEffect, useRef } from "preact/hooks";
import { indentedLineWrapping } from "../../cm-indented-line-wrapping/indentedLineWrapping";
import {
  scriptAppearance,
  setScriptAppearance,
} from "../../cm-script-appearance/scriptAppearance";
import type { ScriptAppearance } from "../../cm-script-appearance/scriptAppearanceOptions";
import EDITOR_HIGHLIGHTS from "../script-editor/constants/EDITOR_HIGHLIGHTS";
import EDITOR_THEME from "../script-editor/constants/EDITOR_THEME";

const SAMPLE_URI = "file:///sample.sd";

export type SparkdownScriptSampleProps = {
  text: string;
  appearance: ScriptAppearance;
  caret?: number;
  label: string;
  class?: string;
};

const selectionAt = (text: string, caret: number | undefined) =>
  EditorSelection.cursor(Math.max(0, Math.min(caret ?? 0, text.length)));

export const createScriptSampleState = (
  text: string,
  appearance: ScriptAppearance,
  caret?: number,
) =>
  EditorState.create({
    doc: text,
    selection: selectionAt(text, caret),
    extensions: [
      vscodeLanguage({
        name: "sparkdown",
        grammar: sparkdownGrammarFor(SAMPLE_URI),
        config: CONFIG_DEFINITION as never,
      }),
      syntaxHighlighting(EDITOR_HIGHLIGHTS),
      lineNumbers(),
      indentUnit.of("  "),
      indentedLineWrapping(),
      EditorView.lineWrapping,
      scriptAppearance(appearance),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme(EDITOR_THEME, { dark: true }),
    ],
  });

export default function SparkdownScriptSample({
  text,
  appearance,
  caret,
  label,
  class: className,
}: SparkdownScriptSampleProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const appearanceRef = useRef(appearance);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) {
      return;
    }
    const view = new EditorView({
      parent,
      root: parent.getRootNode() as Document | ShadowRoot,
      state: createScriptSampleState(text, appearanceRef.current, caret),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    if (view.state.doc.toString() !== text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: selectionAt(text, caret),
      });
      view.scrollDOM.scrollTop = 0;
    }
  }, [text, caret]);

  useEffect(() => {
    const view = viewRef.current;
    const previous = appearanceRef.current;
    appearanceRef.current = appearance;
    if (view && previous !== appearance) {
      setScriptAppearance(view, previous, appearance);
    }
  }, [appearance]);

  return (
    <div
      ref={parentRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-script-sample
      class={className}
    />
  );
}
