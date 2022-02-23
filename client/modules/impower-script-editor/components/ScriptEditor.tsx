import { basicSetup, EditorState, EditorView } from "@codemirror/basic-setup";
import { indentWithTab } from "@codemirror/commands";
import { foldEffect, unfoldAll } from "@codemirror/fold";
import { HighlightStyle } from "@codemirror/highlight";
import { foldable, indentUnit } from "@codemirror/language";
import { Diagnostic, linter } from "@codemirror/lint";
import { panels } from "@codemirror/panel";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from "@codemirror/search";
import { tooltips } from "@codemirror/tooltip";
import { keymap, PluginField, ViewPlugin, ViewUpdate } from "@codemirror/view";
import React, { useEffect, useRef } from "react";
import {
  FountainParseResult,
  parseFountain,
} from "../../impower-script-parser";
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

interface ScriptEditorProps {
  defaultValue: string;
  toggleFolding: boolean;
  searchQuery?: {
    search: string;
    caseSensitive?: boolean;
    regexp?: boolean;
    replace?: string;
    action?:
      | "search"
      | "find_next"
      | "find_previous"
      | "replace"
      | "replace_all";
  };
  defaultScrollTopLine?: number;
  defaultCursor?: {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  };
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
  onChange?: (value: string) => void;
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
    searchQuery?: {
      search: string;
      caseSensitive?: boolean;
      regexp?: boolean;
      replace?: string;
      action?:
        | "search"
        | "find_next"
        | "find_previous"
        | "replace"
        | "replace_all";
    }
  ) => void;
}

const ScriptEditor = React.memo((props: ScriptEditorProps): JSX.Element => {
  const {
    defaultValue,
    style,
    toggleFolding,
    searchQuery,
    defaultScrollTopLine,
    defaultCursor,
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
  const defaultCursorRef = useRef(defaultCursor);
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

  useEffect(() => {
    const fountainParseLinter = (view: EditorView): Diagnostic[] => {
      const result = parseFountain(view.state.doc.toString());
      if (onParseRef.current) {
        onParseRef.current(result);
      }
      return result.diagnostics || [];
    };
    const onOpenSearchPanel = (view: EditorView): void => {
      if (onSearchRef.current) {
        onSearchRef.current(undefined, getSearchQuery(view.state));
      }
    };
    const onCloseSearchPanel = (): void => {
      if (onSearchRef.current) {
        onSearchRef.current(undefined, null);
      }
    };
    const selection = defaultCursorRef.current;
    const startState = EditorState.create({
      selection,
      doc: defaultValueRef.current,
      extensions: [
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
          },
          { dark: true }
        ),
        EditorView.domEventHandlers({
          scroll: (e, v) => {
            const scrollEl = e.target as HTMLElement;
            const scrollTop = scrollEl?.scrollTop;
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
              onChangeRef.current(
                viewRef.current.state.doc.toJSON().join("\n")
              );
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
    if (searchQuery?.action) {
      const view = viewRef.current;
      if (searchQuery.action === "find_next") {
        findNext(viewRef.current);
      } else if (searchQuery.action === "find_previous") {
        findPrevious(viewRef.current);
      } else if (searchQuery.action === "replace") {
        replaceNext(viewRef.current);
      } else if (searchQuery.action === "replace_all") {
        replaceAll(viewRef.current);
      } else {
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
        selectMatches(viewRef.current);
      }
    } else {
      closeSearchPanel(viewRef.current);
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
