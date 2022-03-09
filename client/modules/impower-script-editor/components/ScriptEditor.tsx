import { basicSetup, EditorState, EditorView } from "@codemirror/basic-setup";
import { indentWithTab } from "@codemirror/commands";
import { foldEffect, unfoldAll } from "@codemirror/fold";
import { HighlightStyle } from "@codemirror/highlight";
import { historyField, redo, undo } from "@codemirror/history";
import { foldable, indentUnit } from "@codemirror/language";
import { closeLintPanel, openLintPanel } from "@codemirror/lint";
import { panels } from "@codemirror/panel";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";
import { tooltips } from "@codemirror/tooltip";
import { keymap, PluginField, ViewPlugin, ViewUpdate } from "@codemirror/view";
import React, { useEffect, useRef } from "react";
import {
  FountainDeclarations,
  FountainParseResult,
  parseFountain,
} from "../../impower-script-parser";
import { colors } from "../constants/colors";
import { SearchAction, SerializableEditorState } from "../types/editor";
import { fountain } from "../types/fountain";
import { fountainLanguage, tags as t } from "../types/fountainLanguage";
import { SearchPanel } from "./SearchPanel";

const marginPlugin = ViewPlugin.fromClass(
  class {
    margin: { top: number };

    update(_update: ViewUpdate): void {
      this.margin = { top: 104 };
    }
  },
  {
    provide: PluginField.scrollMargins.from((value) => value.margin),
  }
);

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
    tag: t.character,
    color: colors.character,
  },
  {
    tag: t.parenthetical,
    color: colors.parenthetical,
  },
  {
    tag: t.dualDialogue,
    color: colors.dualDialogue,
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
  { tag: t.asset, color: colors.asset },
  { tag: t.tag, color: colors.tag },
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

interface ScriptEditorProps {
  defaultValue: string;
  augmentations?: FountainDeclarations;
  toggleFolding: boolean;
  toggleLinting: boolean;
  searchQuery?: SearchAction;
  editorAction?: {
    action?: "undo" | "redo";
  };
  defaultState?: SerializableEditorState;
  defaultScrollTopLine?: number;
  scrollTopLine?: number;
  scrollTopLineOffset?: number;
  cursor?: {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  };
  topPanelsContainer?: HTMLElement;
  bottomPanelsContainer?: HTMLElement;
  style?: React.CSSProperties;
  onUpdate?: (update: ViewUpdate) => void;
  onChange?: (value: string, state?: SerializableEditorState) => void;
  onParse?: (result: FountainParseResult) => void;
  onCursor?: (range: {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  }) => void;
  onScrollLine?: (event: Event, firstVisibleLine: number) => void;
  onSearch: (
    e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
    searchQuery?: SearchAction
  ) => void;
}

const ScriptEditor = React.memo((props: ScriptEditorProps): JSX.Element => {
  const {
    defaultValue,
    augmentations,
    style,
    toggleFolding,
    toggleLinting,
    searchQuery,
    editorAction,
    defaultState,
    defaultScrollTopLine,
    scrollTopLine,
    scrollTopLineOffset = 0,
    cursor,
    topPanelsContainer,
    bottomPanelsContainer,
    onUpdate,
    onChange,
    onParse,
    onCursor,
    onScrollLine,
    onSearch,
  } = props;

  const elementRef = useRef<HTMLDivElement>();
  const viewRef = useRef<EditorView>();
  const cursorRef = useRef<{
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  }>();
  const firstVisibleLineRef = useRef<number>();
  const scrollTopLineOffsetRef = useRef(scrollTopLineOffset);
  scrollTopLineOffsetRef.current = scrollTopLineOffset;

  const defaultValueRef = useRef(defaultValue);
  const defaultScrollTopLineRef = useRef(defaultScrollTopLine);
  const defaultStateRef = useRef(defaultState);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;
  const onScrollLineRef = useRef(onScrollLine);
  onScrollLineRef.current = onScrollLine;
  const onParseRef = useRef(onParse);
  onParseRef.current = onParse;
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const augmentationsRef = useRef(augmentations);
  augmentationsRef.current = augmentations;

  useEffect(() => {
    const onOpenSearchPanel = (view: EditorView): void => {
      const searchQuery = getSearchQuery(view.state);
      if (onSearchRef.current) {
        onSearchRef.current(undefined, searchQuery);
      }
    };
    const onCloseSearchPanel = (): void => {
      if (onSearchRef.current) {
        onSearchRef.current(undefined, null);
      }
    };
    const doc =
      defaultStateRef.current?.doc != null
        ? defaultStateRef.current?.doc
        : defaultValueRef.current;
    const selection =
      defaultStateRef.current?.selection != null
        ? EditorSelection.fromJSON(defaultStateRef.current?.selection)
        : { anchor: 0, head: 0 };
    let restoredState: EditorState;
    if (defaultStateRef.current) {
      const { doc, selection, history } = defaultStateRef.current;
      restoredState = EditorState.fromJSON(
        { doc, selection, history },
        {},
        { history: historyField }
      );
    }
    const restoredExtensions = restoredState
      ? [historyField.init(() => restoredState.field(historyField))]
      : [];
    const startState = EditorState.create({
      doc,
      selection,
      extensions: [
        ...restoredExtensions,
        basicSetup,
        marginPlugin,
        search({
          top: true,
          createPanel: (view: EditorView) => {
            return new SearchPanel(view, {
              onOpen: onOpenSearchPanel,
              onClose: onCloseSearchPanel,
            });
          },
        }),
        panels({
          topContainer: topPanelsContainer,
          bottomContainer: bottomPanelsContainer,
        }),
        fountain({
          base: fountainLanguage,
          parse: (script: string) => {
            const result = parseFountain(script, augmentationsRef.current);
            if (onParseRef.current) {
              onParseRef.current(result);
            }
            return result;
          },
        }),
        tooltips({ position: "absolute" }),
        myHighlightStyle,
        keymap.of([indentWithTab]),
        indentUnit.of("    "),
        EditorState.phrases.of({ "No diagnostics": "Running..." }),
        EditorView.theme(
          {
            "&": {
              color: colors.foreground,
              backgroundColor: colors.background,
              flex: 1,
            },
            ".cm-content": {
              caretColor: "white",
            },
            ".cm-scroller": {
              fontFamily: "Courier Prime Sans",
            },
            "&.cm-focused .cm-cursor": {
              borderLeftColor: "white",
            },
            ".cm-gutters": {
              backgroundColor: "#00000066",
              color: colors.lineNumber,
              border: "none",
            },
            ".cm-gutter.cm-lineNumbers": {
              minWidth: "36px",
            },
            ".cm-lineNumbers .cm-gutterElement": {
              padding: "0 2px",
            },
            ".cm-activeLine": {
              backgroundColor: "#FFFFFF0F",
            },
            ".cm-search.cm-panel": {
              left: 0,
              right: 0,
              padding: 0,
            },
            ".cm-foldPlaceholder": {
              backgroundColor: "#00000080",
              borderColor: "#00000080",
              color: "#FFFFFF99",
              margin: "0 4px",
              padding: "0 8px",
            },
            ".cm-completionIcon": {
              paddingRight: "1.25em",
            },
            ".cm-panel.cm-panel-lint": {
              "& ul": {
                "& [aria-selected]": {
                  background_fallback: "#bdf",
                  backgroundColor: "Highlight",
                  color_fallback: "white",
                  color: "HighlightText",
                },
              },
              "& button[name='close']": {
                right: "16px",
                color: "white",
              },
            },
            ".cm-lintRange-active": {
              backgroundColor: "#ffdd991a",
            },
          },
          { dark: true }
        ),
        EditorView.domEventHandlers({
          scroll: (e, v) => {
            const scrollEl = e.target as HTMLElement;
            const scrollTop =
              scrollEl?.scrollTop != null
                ? scrollEl?.scrollTop
                : window.scrollY;
            let firstVisibleLine;
            for (let i = 0; i < v.viewportLineBlocks.length; i += 1) {
              const block = v.viewportLineBlocks[i];
              if (block.top - scrollTop > 0) {
                firstVisibleLine = v.state.doc.lineAt(block.from).number;
                break;
              }
            }
            if (firstVisibleLineRef.current !== firstVisibleLine) {
              firstVisibleLineRef.current = firstVisibleLine;
              if (onScrollLineRef.current) {
                onScrollLineRef.current(e, firstVisibleLine);
              }
            }
          },
        }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (onUpdateRef.current) {
            onUpdateRef.current(u);
          }
          if (u.docChanged) {
            if (onChangeRef.current) {
              const json = u.state.toJSON({ history: historyField });
              const doc = u.view.state.doc.toJSON().join("\n");
              const selection = u.view.state.selection.toJSON();
              const history = json?.history;
              const transaction = u.transactions?.[0];
              const userEvent = transaction?.isUserEvent("undo")
                ? "undo"
                : transaction?.isUserEvent("redo")
                ? "redo"
                : null;
              onChangeRef.current(doc, {
                doc,
                selection,
                history,
                userEvent,
              });
            }
          }
          const cursorRange = u.state.selection.main;
          const anchor = cursorRange?.anchor;
          const head = cursorRange?.head;
          const fromLine = u.state.doc.lineAt(anchor)?.number;
          const toLine = u.state.doc.lineAt(head)?.number;
          if (
            cursorRef.current?.fromLine !== fromLine ||
            cursorRef.current?.toLine !== toLine ||
            cursorRef.current?.anchor !== anchor ||
            cursorRef.current?.head !== head
          ) {
            if (onCursorRef.current) {
              onCursorRef.current({
                anchor,
                head,
                fromLine,
                toLine,
              });
            }
          }
          cursorRef.current = {
            anchor,
            head,
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
  }, [bottomPanelsContainer, topPanelsContainer]);

  useEffect(() => {
    if (editorAction?.action === "undo") {
      undo(viewRef.current);
    }
    if (editorAction?.action === "redo") {
      redo(viewRef.current);
    }
  }, [editorAction]);

  useEffect(() => {
    if (toggleLinting) {
      openLintPanel(viewRef.current);
    } else {
      closeLintPanel(viewRef.current);
    }
  }, [toggleLinting]);

  useEffect(() => {
    if (toggleFolding) {
      const view = viewRef?.current;
      const state = view?.state;
      const effects = [];
      for (let pos = 0; pos < state.doc.length; ) {
        const line = view.lineBlockAt(pos);
        const range = foldable(state, line.from, line.to);
        if (range) {
          effects.push(foldEffect.of(range));
        }
        pos = line.to + 1;
      }
      viewRef.current.dispatch({
        effects,
      });
    } else {
      unfoldAll(viewRef.current);
    }
  }, [toggleFolding]);

  useEffect(() => {
    const view = viewRef.current;
    if (searchQuery) {
      if (searchQuery.action === "find_next") {
        if (searchQuery.search) {
          findNext(viewRef.current);
        }
      } else if (searchQuery.action === "find_previous") {
        if (searchQuery.search) {
          findPrevious(viewRef.current);
        }
      } else if (searchQuery.action === "replace") {
        if (searchQuery.search) {
          replaceNext(viewRef.current);
        }
      } else if (searchQuery.action === "replace_all") {
        if (searchQuery.search) {
          replaceAll(viewRef.current);
        }
      } else {
        openSearchPanel(view);
        view.dispatch({
          effects: [
            setSearchQuery.of(
              new SearchQuery({
                search: searchQuery.search,
                caseSensitive: searchQuery.caseSensitive,
                regexp: searchQuery.regexp,
                replace: searchQuery.replace,
              })
            ),
          ],
        });
      }
    } else {
      closeSearchPanel(view);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (viewRef.current && cursor) {
      const line = Math.max(1, cursor.fromLine);
      const from = viewRef.current.state.doc.line(line)?.from;
      viewRef.current.dispatch({
        selection: { anchor: from },
        effects: EditorView.scrollIntoView(from, { y: "center" }),
      });
    }
  }, [cursor]);

  useEffect(() => {
    if (viewRef.current && defaultScrollTopLineRef.current >= 0) {
      const line = Math.max(
        1,
        defaultScrollTopLineRef.current + scrollTopLineOffsetRef.current
      );
      const from = viewRef.current.state.doc.line(line)?.from;
      viewRef.current.dispatch({
        effects: EditorView.scrollIntoView(from, { y: "start" }),
      });
    }
  }, []);

  useEffect(() => {
    if (viewRef.current && scrollTopLine >= 0) {
      const line = Math.max(1, scrollTopLine + scrollTopLineOffsetRef.current);
      const from = viewRef.current.state.doc.line(line)?.from;
      viewRef.current.dispatch({
        effects: EditorView.scrollIntoView(from, { y: "start" }),
      });
    }
  }, [scrollTopLine]);

  return (
    <div
      ref={elementRef}
      style={{ flex: 1, display: "flex", flexDirection: "column", ...style }}
    ></div>
  );
});

export default ScriptEditor;
