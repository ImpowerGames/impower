import { historyField } from "@codemirror/commands";
import { syntaxTreeAvailable } from "@codemirror/language";
import { EditorSelection, EditorState, Extension } from "@codemirror/state";
import {
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  panels,
  tooltips,
} from "@codemirror/view";
import { foldedField } from "../cm-folded/foldedField";
import { LanguageServerConnection } from "../cm-languageclient";
import EXTENSIONS from "../constants/EXTENSIONS";
import SPARKDOWN_THEME from "../constants/SPARKDOWN_THEME";
import {
  SerializableChangeSet,
  SerializableEditorSelection,
  SerializableEditorState,
  SerializableFoldedState,
  SerializableHistoryState,
} from "../types/editor";
import { lockBodyScrolling, unlockBodyScrolling } from "./bodyScrolling";
import { sparkdownLanguageExtension } from "./sparkdownLanguageExtension";

interface EditorOptions {
  connection: LanguageServerConnection;
  disableBodyScrollLocking?: number;
  scrollMargin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  contentPadding?: {
    top?: string | null;
    bottom?: string | null;
    left?: string | null;
    right?: string | null;
  };
  footerHeight?: number;
  backgroundColor?: string;
  runningLine?: number;
  toggleFolding?: boolean;
  toggleLinting?: boolean;
  toggleGotoLine?: boolean;
  focusFirstError?: boolean;
  snippetPreview?: string;
  editorChange?: {
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
  onFocus?: (value: string) => void;
  onBlur?: (value: string) => void;
  style?: {
    backgroundColor: string;
  };
}

const createEditorView = (
  parent: HTMLElement,
  options?: EditorOptions
): EditorView => {
  const connection = options?.connection;
  const disableBodyScrollLocking = options?.disableBodyScrollLocking;
  const contentPadding = options?.contentPadding;
  const scrollMargin = options?.scrollMargin;
  const footerHeight = options?.footerHeight;
  const backgroundColor = options?.backgroundColor;
  const defaultState = options?.defaultState;
  const topPanelsContainer = options?.topPanelsContainer;
  const bottomPanelsContainer = options?.bottomPanelsContainer;
  const onReady = options?.onReady;
  const onViewUpdate = options?.onViewUpdate;
  const onScrollLine = options?.onScrollLine;
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
  const marginPlugin: Extension = ViewPlugin.fromClass(
    class {
      margin?: { top?: number; bottom?: number; left?: number; right?: number };

      update(_update: ViewUpdate): void {
        this.margin = scrollMargin;
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
  const startState = EditorState.create({
    doc,
    selection,
    extensions: [
      ...restoredExtensions,
      marginPlugin,
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
            top: scrollMargin?.top ?? 0,
            left: 0,
            bottom: window.innerHeight - (footerHeight ?? 0),
            right: window.innerWidth,
          };
        },
      }),
      EXTENSIONS,
      sparkdownLanguageExtension({ connection }),
      EditorView.theme(
        {
          ...SPARKDOWN_THEME,
          ".cm-content": {
            ...(contentPadding?.top != null
              ? { paddingTop: `${contentPadding?.top}` }
              : {}),
            ...(contentPadding?.bottom != null
              ? { paddingBottom: `${contentPadding?.bottom}` }
              : {}),
            ...(contentPadding?.left != null
              ? { paddingLeft: `${contentPadding?.left}` }
              : {}),
            ...(contentPadding?.right != null
              ? { paddingRight: `${contentPadding?.right}` }
              : {}),
          },
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
            lockBodyScrolling();
          } else {
            unlockBodyScrolling();
          }
        }

        const snippet = Boolean(parent.querySelector(".cm-snippetField"));
        const lint = Boolean(parent.querySelector(".cm-panel-lint"));
        const selected =
          selection?.ranges?.[selection.main]?.head !==
          selection?.ranges?.[selection.main]?.anchor;
        const editorState = {
          doc,
          selection,
          history,
          userEvent,
          focused,
          selected,
          snippet,
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
            onFocus?.(doc);
          } else {
            onBlur?.(doc);
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
