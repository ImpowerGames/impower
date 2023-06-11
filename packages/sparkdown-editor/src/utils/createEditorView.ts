import { historyField } from "@codemirror/commands";
import { syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { getSearchQuery } from "@codemirror/search";
import { EditorSelection, EditorState, Extension } from "@codemirror/state";
import {
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  panels,
  tooltips,
} from "@codemirror/view";
import EngineSparkParser from "../../../spark-engine/src/parser/classes/EngineSparkParser";
import { SparkDeclarations } from "../../../sparkdown/src/types/SparkDeclarations";
import { SparkParseResult } from "../../../sparkdown/src/types/SparkParseResult";
import { printTree } from "../cm-textmate/utils/printTree";
import EXTENSIONS from "../constants/EXTENSIONS";
import SPARKDOWN_THEME from "../constants/SPARKDOWN_THEME";
import { foldedField } from "../extensions/foldedField";
import {
  SearchLineQuery,
  getSearchLineQuery,
  searchLinePanel,
} from "../extensions/searchLinePanel";
import { searchTextPanel } from "../extensions/searchTextPanel";
import sparkdownLanguageSupport from "../extensions/sparkdownLanguageSupport";
import { SearchTextQuery } from "../panels/SearchTextPanel";
import {
  SerializableChangeSet,
  SerializableEditorSelection,
  SerializableEditorState,
  SerializableFoldedState,
  SerializableHistoryState,
} from "../types/editor";

const PARSE_CACHE: {
  current?: SparkParseResult;
} = {};

interface EditorOptions {
  disableBodyScrollLocking?: number;
  margin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  footerHeight?: number;
  backgroundColor?: string;
  runningLine?: number;
  toggleFolding?: boolean;
  toggleLinting?: boolean;
  toggleGotoLine?: boolean;
  focusFirstError?: boolean;
  snippetPreview?: string;
  searchTextQuery?: SearchTextQuery;
  searchLineQuery?: SearchLineQuery;
  editorChange: {
    category?: string;
    action?: string;
    focus?: boolean;
    selection?: SerializableEditorSelection;
  };
  defaultState?: SerializableEditorState;
  defaultScrollTopLine?: number;
  scrollTopLine?: number;
  scrollTopLineOffset?: number;
  topPanelsContainer?: HTMLElement;
  bottomPanelsContainer?: HTMLElement;
  getDoc?: () => string;
  setDoc?: (value: string, changes: SerializableChangeSet) => void;
  getEditorState?: () => SerializableEditorState;
  setEditorState?: (value: SerializableEditorState) => void;
  getCursor?: () => {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  };
  setCursor?: (range: {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  }) => void;
  getFirstVisibleLine?: () => number;
  setFirstVisibleLine?: (value: number) => void;
  onReady?: () => void;
  onViewUpdate?: (update: ViewUpdate) => void;
  onScrollLine?: (event: Event, firstVisibleLine: number) => void;
  onOpenSearchTextPanel?: (query?: SearchTextQuery) => void;
  onCloseSearchTextPanel?: (query?: SearchTextQuery) => void;
  onOpenSearchLinePanel?: (query?: SearchLineQuery) => void;
  onCloseSearchLinePanel?: (query?: SearchLineQuery) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  getAugmentations?: () => SparkDeclarations;
  onParse?: (result: SparkParseResult) => void;
  getRuntimeValue?: (id: string) => unknown;
  setRuntimeValue?: (id: string, expression: string) => void;
  observeRuntimeValue?: (
    listener: (id: string, value: unknown) => void
  ) => void;
  onNavigateUp?: (view: EditorView) => boolean;
  onNavigateDown?: (view: EditorView) => boolean;
  style?: {
    backgroundColor: string;
  };
}

const createEditorView = (
  parent: HTMLElement,
  options?: EditorOptions
): EditorView => {
  const disableBodyScrollLocking = options?.disableBodyScrollLocking;
  const margin = options?.margin;
  const footerHeight = options?.footerHeight;
  const backgroundColor = options?.backgroundColor;
  const defaultState = options?.defaultState;
  const topPanelsContainer = options?.topPanelsContainer;
  const bottomPanelsContainer = options?.bottomPanelsContainer;
  const onReady = options?.onReady;
  const onViewUpdate = options?.onViewUpdate;
  const onScrollLine = options?.onScrollLine;
  const onOpenSearchTextPanel = options?.onOpenSearchTextPanel;
  const onCloseSearchTextPanel = options?.onCloseSearchTextPanel;
  const onOpenSearchLinePanel = options?.onOpenSearchLinePanel;
  const onCloseSearchLinePanel = options?.onCloseSearchLinePanel;
  const onBlur = options?.onBlur;
  const onFocus = options?.onFocus;
  const getCursor = options?.getCursor;
  const setCursor = options?.setCursor;
  const getFirstVisibleLine = options?.getFirstVisibleLine;
  const setFirstVisibleLine = options?.setFirstVisibleLine;
  const getEditorState = options?.getEditorState;
  const setEditorState = options?.setEditorState;
  const getDoc = options?.getDoc;
  const setDoc = options?.setDoc;
  const getAugmentations = options?.getAugmentations;
  const onParse = options?.onParse;
  // const getRuntimeValue = options?.getRuntimeValue;
  // const setRuntimeValue = options?.setRuntimeValue;
  // const observeRuntimeValue = options?.observeRuntimeValue;
  // const onNavigateUp = options?.onNavigateUp;
  // const onNavigateDown = options?.onNavigateDown;
  const marginPlugin: Extension = ViewPlugin.fromClass(
    class {
      margin?: { top?: number; bottom?: number; left?: number; right?: number };

      update(_update: ViewUpdate): void {
        this.margin = margin;
      }
    },
    {
      provide: (plugin) =>
        EditorView.scrollMargins.of((view) => {
          const value = view.plugin(plugin);
          return {
            ...(value?.margin || {}),
          };
        }),
    }
  );
  const handleOpenSearchTextPanel = (view: EditorView): void => {
    const searchInput = document.querySelector<HTMLInputElement>(
      "input[name='search']"
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
    const query = getSearchQuery(view.state);
    onOpenSearchTextPanel?.(query);
  };
  const handleCloseSearchTextPanel = (view: EditorView): void => {
    const query = getSearchQuery(view.state);
    onCloseSearchTextPanel?.(query);
  };
  const handleOpenSearchLinePanel = (view: EditorView): void => {
    const searchInput = document.querySelector<HTMLInputElement>(
      "input[name='search']"
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
    const query = getSearchLineQuery(view.state);
    onOpenSearchLinePanel?.(query);
  };
  const handleCloseSearchLinePanel = (view: EditorView): void => {
    const query = getSearchLineQuery(view.state);
    onCloseSearchLinePanel?.(query);
  };
  const doc = defaultState?.doc ?? getDoc?.();
  const selection =
    defaultState?.selection != null
      ? EditorSelection.fromJSON(defaultState?.selection)
      : { anchor: 0, head: 0 };
  let restoredState: EditorState | undefined;
  if (defaultState?.selection) {
    const selection = defaultState?.selection;
    const history = defaultState?.history;
    const folded = defaultState?.folded;
    restoredState = EditorState.fromJSON(
      {
        doc,
        selection,
        history,
        folded,
      },
      {},
      { history: historyField, folded: foldedField }
    );
  }
  const restoredExtensions = restoredState
    ? [
        historyField.init(() => restoredState?.field(historyField)),
        foldedField.init(
          () => restoredState?.field(foldedField) as DecorationSet
        ),
      ]
    : [];
  const languageSetup: Extension[] = [
    // TODO: Add Sparkdown Language Support
    sparkdownLanguageSupport({
      initialDoc: doc ?? "",
      parse: (script: string) => {
        const augmentations = getAugmentations?.();
        const result = EngineSparkParser.instance.parse(script, {
          augmentations,
        });
        PARSE_CACHE.current = { ...result };
        if (onParse) {
          onParse(result);
        }
        return result;
      },
      //   getRuntimeValue,
      //   setRuntimeValue,
      //   observeRuntimeValue,
      //   onNavigateUp,
      //   onNavigateDown,
    }),
  ];
  const startState = EditorState.create({
    doc,
    selection,
    extensions: [
      ...restoredExtensions,
      marginPlugin,
      searchLinePanel({
        onOpen: handleOpenSearchLinePanel,
        onClose: handleCloseSearchLinePanel,
      }),
      searchTextPanel({
        onOpen: handleOpenSearchTextPanel,
        onClose: handleCloseSearchTextPanel,
      }),
      panels({
        topContainer: topPanelsContainer,
        bottomContainer: bottomPanelsContainer,
      }),
      tooltips({
        position: "absolute",
        tooltipSpace: (): {
          top: number;
          left: number;
          bottom: number;
          right: number;
        } => {
          return {
            top: margin?.top ?? 0,
            left: 0,
            bottom: window.innerHeight - (footerHeight ?? 0),
            right: window.innerWidth,
          };
        },
      }),
      EXTENSIONS,
      languageSetup,
      EditorView.theme(
        {
          ...SPARKDOWN_THEME,
          ".cm-panels": {
            ...(backgroundColor ? { backgroundColor } : {}),
          },
        },
        { dark: true }
      ),
      EditorView.domEventHandlers({
        scroll: (e, v) => {
          const scrollEl = e.target as HTMLElement;
          const scrollTop =
            scrollEl?.scrollTop != null ? scrollEl?.scrollTop : window.scrollY;
          let firstVisibleLine = 0;
          for (let i = 0; i < v.viewportLineBlocks.length; i += 1) {
            const block = v.viewportLineBlocks[i];
            if (block) {
              if (block.top - scrollTop > 0) {
                firstVisibleLine = v.state.doc.lineAt(block.from).number;
                break;
              }
            }
          }
          if (getFirstVisibleLine?.() !== firstVisibleLine) {
            setFirstVisibleLine?.(firstVisibleLine);
            onScrollLine?.(e, firstVisibleLine);
          }
        },
      }),
      EditorView.updateListener.of((u) => {
        const parsed = syntaxTreeAvailable(u.state);
        if (parsed) {
          onReady?.();
        }

        // DEBUG
        const tree = syntaxTree(u.state);
        console.log(printTree(tree, u.state.doc.toString()));
        onViewUpdate?.(u);
        const json: {
          history: SerializableHistoryState;
          folded: SerializableFoldedState;
        } = u.state.toJSON({
          history: historyField,
          folded: foldedField,
        });
        const doc = u.view.state.doc.toJSON().join("\n");
        const selection =
          u.view.state.selection.toJSON() as SerializableEditorSelection;
        const history = json?.history;
        const folded = json?.folded;
        const transaction = u.transactions?.[0];
        const userEvent = transaction?.isUserEvent("undo")
          ? "undo"
          : transaction?.isUserEvent("redo")
          ? "redo"
          : undefined;
        const focused = u.view.hasFocus;
        if (!disableBodyScrollLocking) {
          if (focused) {
            document.body.style.setProperty("overflow", "hidden");
          } else {
            document.body.style.setProperty("overflow", null);
          }
        }

        const snippet = Boolean(parent.querySelector(".cm-snippetField"));
        const lint = Boolean(parent.querySelector(".cm-panel-lint"));
        const selected =
          selection?.ranges?.[selection.main]?.head !==
          selection?.ranges?.[selection.main]?.anchor;
        const diagnostics = PARSE_CACHE?.current?.diagnostics;
        const editorState = {
          doc,
          selection,
          history,
          userEvent,
          focused,
          selected,
          snippet,
          diagnostics,
          folded,
        };
        if (parent) {
          if (snippet) {
            parent.classList.add("cm-snippet");
          } else {
            parent.classList.remove("cm-snippet");
          }
          if (lint) {
            parent.classList.add("cm-lint");
          } else {
            parent.classList.remove("cm-lint");
          }
        }
        if (
          JSON.stringify(getEditorState?.() || {}) !==
          JSON.stringify(editorState)
        ) {
          setEditorState?.(editorState);
        }
        if (u.focusChanged) {
          if (u.view.hasFocus) {
            onFocus?.();
          } else {
            onBlur?.();
          }
        }
        if (u.docChanged) {
          setDoc?.(doc, u.changes.toJSON());
        }
        setEditorState?.(editorState);
        const cursorRange = u.state.selection.main;
        const anchor = cursorRange?.anchor;
        const head = cursorRange?.head;
        const fromLine = u.state.doc.lineAt(anchor)?.number;
        const toLine = u.state.doc.lineAt(head)?.number;
        const cursor = getCursor?.();
        if (
          cursor?.fromLine !== fromLine ||
          cursor?.toLine !== toLine ||
          cursor?.anchor !== anchor ||
          cursor?.head !== head
        ) {
          setCursor?.({
            anchor,
            head,
            fromLine,
            toLine,
          });
        }
      }),
    ],
  });
  const view = new EditorView({
    state: startState,
    parent,
  });
  return view;
};

export default createEditorView;
