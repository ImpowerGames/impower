import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { evaluate } from "../../../../../evaluate";
import {
  getEntityObjects,
  getGlobalValueContext,
  getScopedValueContext,
  getSectionAtLine,
  parseSpark,
  SparkEntity,
  SparkParseResult,
} from "../../../../../sparkdown";
import { debounce } from "../../../impower-core";
import { CommandData } from "../../../impower-game/data";
import { loadStyles } from "../../../impower-game/dom";
import { loadUI } from "../../../impower-game/dom/loadUI";
import {
  getRuntimeCommand,
  getRuntimeEntity,
  getScriptAugmentations,
} from "../../../impower-game/parser";
import { FadeAnimation } from "../../../impower-route";
import {
  colors,
  SearchLineQuery,
  SearchTextQuery,
} from "../../../impower-script-editor";
import { SerializableEditorState } from "../../../impower-script-editor/types/editor";
import { GameContext } from "../../contexts/gameContext";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  panelSaveEditorState,
  panelSearchLine,
  panelSearchText,
  panelSetCursor,
  panelSetScrollTopLine,
} from "../../types/actions/panelActions";
import { projectChangeScript } from "../../types/actions/projectActions";
import { testSetCompiling } from "../../types/actions/testActions";

const ScriptEditor = dynamic(
  () => import("../../../impower-script-editor/components/ScriptEditor"),
  {
    ssr: false,
  }
);

const StyledContainerScriptEditor = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  & * {
    user-select: text;
  }
`;

const StyledFadeAnimation = styled(FadeAnimation)`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface LogicScriptEditorProps {
  toggleFolding: boolean;
  toggleLinting: boolean;
  onSectionChange: (name: string) => void;
}

const LogicScriptEditor = React.memo(
  (props: LogicScriptEditorProps): JSX.Element => {
    const { toggleFolding, toggleLinting, onSectionChange } = props;

    const { transitionState } = useContext(WindowTransitionContext);
    const { gameInspector } = useContext(GameInspectorContext);
    const { game } = useContext(GameContext);
    const [state, dispatch] = useContext(ProjectEngineContext);

    const windowType = "logic";

    const events = game?.[windowType]?.events;
    const searchTextQuery = state?.panel?.panels?.[windowType]?.searchTextQuery;
    const searchLineQuery = state?.panel?.panels?.[windowType]?.searchLineQuery;
    const snippetPreview = state?.panel?.panels?.[windowType]?.snippetPreview;
    const mode = state?.test?.mode;
    const debug = state?.test?.debug;
    const id = state?.project?.id;
    const files = state?.project?.data?.files?.data;
    const defaultValue =
      state?.project?.data?.scripts?.data?.[windowType.toLowerCase()] || "";
    const editor = state?.panel?.panels?.[windowType]?.editorState;
    const defaultScrollTopLine =
      state?.panel?.panels?.[windowType]?.scrollTopLine;
    const editorChange = state?.panel?.panels?.[windowType]?.editorChange;

    const augmentations = useMemo(() => getScriptAugmentations(files), [files]);

    const initialRef = useRef(true);
    const cursorRef = useRef<{
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    }>();
    const scriptValueRef = useRef<string>();
    const lastEditorStateRef = useRef<SerializableEditorState>();
    const scrollTopLineRef = useRef<number>();
    const parseResultRef = useRef<SparkParseResult>();
    const currentSectionNameRef = useRef<string>();
    const variableValueListenerRef =
      useRef<(data: { id: string; value: unknown }) => void>();
    const gameRef = useRef(game);
    gameRef.current = game;

    const [ready, setReady] = useState(false);
    const [parseResultState, setParseResultState] =
      useState<SparkParseResult>();
    const [executingCursor, setExecutingCursor] = useState<{
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    }>();
    const [cursor, setCursor] = useState<{
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    }>();
    const previewCursorRef = useRef<{
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    }>();
    const [previewCursor, setPreviewCursor] = useState(
      previewCursorRef.current
    );

    useEffect(() => {
      const onExecuteCommand = (data: { pos: number; line: number }): void => {
        if (data.line >= 0) {
          cursorRef.current = {
            anchor: data.pos,
            head: data.pos,
            fromLine: data.line,
            toLine: data.line,
          };
          setExecutingCursor(cursorRef.current);
          setCursor(cursorRef.current);
        }
      };
      if (events) {
        events.onExecuteCommand.addListener(onExecuteCommand);
      }
      return (): void => {
        if (events) {
          events.onExecuteCommand.removeListener(onExecuteCommand);
        }
      };
    }, [events]);

    const handleOpenSearchTextPanel = useCallback(
      (query?: SearchTextQuery) => {
        dispatch(panelSearchText(windowType, query));
      },
      [dispatch, windowType]
    );

    const handleCloseSearchTextPanel = useCallback(() => {
      dispatch(panelSearchText(windowType, null));
    }, [dispatch, windowType]);

    const handleOpenSearchLinePanel = useCallback(
      (query?: SearchLineQuery) => {
        dispatch(panelSearchLine(windowType, query));
      },
      [dispatch, windowType]
    );

    const handleCloseSearchLinePanel = useCallback(() => {
      dispatch(panelSearchLine(windowType, null));
    }, [dispatch, windowType]);

    const handleScriptParse = useCallback((result: SparkParseResult) => {
      parseResultRef.current = result;
      setParseResultState(parseResultRef.current);
    }, []);

    const handleSaveScriptChange = useCallback(() => {
      dispatch(
        projectChangeScript(
          id,
          windowType.toLowerCase(),
          scriptValueRef.current
        )
      );
      dispatch(testSetCompiling(windowType, false));
    }, [dispatch, id, windowType]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedScriptChange = useCallback(
      debounce(handleSaveScriptChange, 1000),
      [handleSaveScriptChange]
    );

    const handleSaveEditorChange = useCallback(() => {
      dispatch(panelSaveEditorState(windowType, lastEditorStateRef.current));
    }, [dispatch, windowType]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedEditorChange = useCallback(
      debounce(handleSaveEditorChange, 1000),
      [handleSaveEditorChange]
    );

    const handleUpdate = useCallback(() => {
      setReady(true);
    }, []);

    const handleEditorUpdate = useCallback(
      (value: string, state: SerializableEditorState) => {
        const canUndo = state?.history?.done?.length > 1;
        const canRedo = state?.history?.undone?.length > 0;
        const focused = state?.focused;
        const selected = state?.selected;
        const diagnostics = state?.diagnostics;
        const folded = state?.folded;
        const canUndoChanged =
          lastEditorStateRef.current?.history?.done?.length > 1 !== canUndo;
        const canRedoChanged =
          lastEditorStateRef.current?.history?.undone?.length > 0 !== canRedo;
        const focusChanged = lastEditorStateRef.current?.focused !== focused;
        const selectedChanged =
          lastEditorStateRef.current?.selected !== selected;
        const diagnosticsChanged =
          JSON.stringify(lastEditorStateRef.current?.diagnostics || []) !==
          JSON.stringify(diagnostics || []);
        const foldedChanged =
          JSON.stringify(lastEditorStateRef.current?.folded) !==
          JSON.stringify(folded);
        const focusedOtherInput =
          focusChanged &&
          !focused &&
          document?.activeElement?.tagName?.toLowerCase() === "input";
        if (
          canUndoChanged ||
          canRedoChanged ||
          focusChanged ||
          selectedChanged ||
          diagnosticsChanged ||
          foldedChanged
        ) {
          // Save editor change immediately so ui reflects change.
          if (!focusedOtherInput) {
            lastEditorStateRef.current = state;
            handleSaveEditorChange();
          }
        } else {
          lastEditorStateRef.current = state;
          handleDebouncedEditorChange();
        }
      },
      [handleDebouncedEditorChange, handleSaveEditorChange]
    );

    const handleDocChange = useCallback(
      (value: string) => {
        dispatch(testSetCompiling(windowType, true));
        if (scriptValueRef.current !== value) {
          scriptValueRef.current = value;
          handleDebouncedScriptChange();
        }
      },
      [dispatch, handleDebouncedScriptChange, windowType]
    );

    const handleSaveScriptCursor = useCallback(() => {
      const cursor = cursorRef.current;
      dispatch(panelSetCursor(windowType, cursor));
    }, [dispatch, windowType]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedScriptCursor = useCallback(
      debounce(handleSaveScriptCursor, 200),
      [handleSaveScriptCursor]
    );

    const handleScriptCursor = useCallback(
      (range: {
        anchor: number;
        head: number;
        fromLine: number;
        toLine: number;
      }) => {
        if (mode === "Test") {
          dispatch(panelSetCursor(windowType, cursorRef.current));
          return;
        }
        if (cursorRef.current?.fromLine !== range.fromLine) {
          cursorRef.current = range;
          previewCursorRef.current = range;
          setPreviewCursor(previewCursorRef.current);
          handleDebouncedScriptCursor();
        }
      },
      [dispatch, handleDebouncedScriptCursor, mode, windowType]
    );

    const handleSaveScrollTopLine = useCallback(() => {
      const scrollTopLine = scrollTopLineRef.current;
      dispatch(panelSetScrollTopLine(windowType, scrollTopLine));
    }, [dispatch, windowType]);

    const debouncedSaveScrollTopLineRef = useRef(
      debounce(handleSaveScrollTopLine, 200)
    );

    const handleScrollLine = useCallback(
      (e: Event, firstVisibleLine: number) => {
        scrollTopLineRef.current = firstVisibleLine;
        if (!parseResultRef.current) {
          parseResultRef.current = parseSpark(
            scriptValueRef.current,
            augmentations,
            { lineOffset: 1 }
          );
        }
        const parseResult = parseResultRef.current;
        const firstVisibleTokenIndex =
          parseResult?.tokenLines?.[firstVisibleLine];
        if (firstVisibleTokenIndex >= 0) {
          let lastSectionName = "";
          for (let i = firstVisibleTokenIndex - 2; i >= 0; i -= 1) {
            const token = parseResult?.tokens?.[i];
            if (token?.type === "section") {
              lastSectionName = token.content;
              break;
            }
          }
          if (currentSectionNameRef.current !== lastSectionName) {
            currentSectionNameRef.current = lastSectionName;
            if (onSectionChange) {
              onSectionChange(lastSectionName);
            }
          }
        }
        debouncedSaveScrollTopLineRef.current?.(firstVisibleLine);
      },
      [augmentations, onSectionChange]
    );

    const getPreviewEntity = useCallback(
      (result: SparkParseResult, line: number): SparkEntity => {
        if (!result) {
          return undefined;
        }
        if (!line) {
          return undefined;
        }
        let tokenIndex = result.tokenLines[line];
        let token = result.tokens[tokenIndex];
        if (token) {
          while (tokenIndex < result.tokens.length && token.skipToNextPreview) {
            tokenIndex += 1;
            token = result.tokens[tokenIndex];
          }
          const runtimeEntity = getRuntimeEntity(token, result?.entities);
          return runtimeEntity;
        }
        return null;
      },
      []
    );

    const getPreviewCommand = useCallback(
      (result: SparkParseResult, line: number): CommandData => {
        if (!result) {
          return undefined;
        }
        if (!line) {
          return undefined;
        }
        let tokenIndex = result.tokenLines[line];
        let token = result.tokens[tokenIndex];
        if (token) {
          while (tokenIndex < result.tokens.length && token.skipToNextPreview) {
            tokenIndex += 1;
            token = result.tokens[tokenIndex];
          }
          const [sectionId] = getSectionAtLine(line, result);
          const runtimeCommand = getRuntimeCommand(token, sectionId);
          return runtimeCommand;
        }
        return null;
      },
      []
    );

    const handlePreviewResult = useCallback(
      (
        result: SparkParseResult,
        pos: number,
        line: number,
        instant: boolean,
        debug: boolean
      ) => {
        if (mode !== "Edit") {
          return;
        }
        const runtimeCommand = getPreviewCommand(result, line);
        if (runtimeCommand) {
          const commandInspector = gameInspector.getInspector(
            runtimeCommand.reference
          );
          if (commandInspector) {
            const [sectionId] = getSectionAtLine(line, result);
            const [, valueMap] = getScopedValueContext(
              sectionId,
              result?.sections
            );
            const objectMap = getEntityObjects(result?.entities);
            commandInspector.onPreview(runtimeCommand, {
              valueMap,
              objectMap,
              instant,
              debug,
            });
          }
        } else {
          const previewEntity = getPreviewEntity(result, line);
          if (previewEntity?.type === "style") {
            const objectMap = getEntityObjects(result?.entities);
            loadStyles(objectMap, ...Object.keys(objectMap?.style || {}));
          }
          if (previewEntity?.type === "ui") {
            const objectMap = getEntityObjects(result?.entities);
            loadUI(objectMap, previewEntity.name);
          }
        }
      },
      [gameInspector, getPreviewCommand, getPreviewEntity, mode]
    );

    const handleGetRuntimeValue = useCallback((id: string): unknown => {
      if (!gameRef.current) {
        return undefined;
      }
      const result = parseResultRef.current;
      const runtimeValue = gameRef.current.getRuntimeValue(id);
      const context = getGlobalValueContext(result);
      const initialValue = context?.[id];
      return runtimeValue != null ? runtimeValue : initialValue;
    }, []);

    const handleSetRuntimeValue = useCallback(
      (id: string, expression: string): void => {
        if (!gameRef.current) {
          return;
        }
        const value = evaluate(expression);
        gameRef.current.setRuntimeValue(id, value);
      },
      []
    );

    const handleObserveRuntimeValue = useCallback(
      (listener: (id: string, value: unknown) => void): void => {
        if (!gameRef.current) {
          return;
        }
        if (variableValueListenerRef.current) {
          gameRef.current.logic.events.onSetVariableValue.removeListener(
            variableValueListenerRef.current
          );
          gameRef.current.logic.events.onExecuteBlock.removeListener(
            variableValueListenerRef.current
          );
        }
        const onSetVariableValue = ({ id, value }): void => {
          listener(id, value);
        };
        variableValueListenerRef.current = onSetVariableValue;
        gameRef.current.logic.events.onSetVariableValue.addListener(
          variableValueListenerRef.current
        );
        gameRef.current.logic.events.onExecuteBlock.addListener(
          variableValueListenerRef.current
        );
      },
      []
    );

    const handleNavigateUp = useCallback((): boolean => {
      const result = parseResultRef.current;
      const currentPreviewCommand = getPreviewCommand(
        result,
        cursorRef.current.fromLine
      );
      const currentLine = currentPreviewCommand
        ? currentPreviewCommand.line
        : cursorRef.current.fromLine;
      for (let i = currentLine; i >= 0; i -= 1) {
        const prevPreviewCommand = getPreviewCommand(result, i);
        if (
          prevPreviewCommand &&
          prevPreviewCommand.line !== currentPreviewCommand?.line
        ) {
          cursorRef.current = {
            anchor: prevPreviewCommand.pos,
            head: prevPreviewCommand.pos,
            fromLine: prevPreviewCommand.line,
            toLine: prevPreviewCommand.line,
          };
          setCursor(cursorRef.current);
          setPreviewCursor(cursorRef.current);
          return true;
        }
      }
      return true;
    }, [getPreviewCommand]);

    const handleNavigateDown = useCallback((): boolean => {
      const result = parseResultRef.current;
      const currentPreviewCommand = getPreviewCommand(
        result,
        cursorRef.current.fromLine
      );
      const currentLine = currentPreviewCommand
        ? currentPreviewCommand.line
        : cursorRef.current.fromLine;
      const lastTokenLine = result.tokens[result.tokens.length - 1].line;
      for (let i = currentLine; i <= lastTokenLine; i += 1) {
        const nextPreviewCommand = getPreviewCommand(result, i);
        if (
          nextPreviewCommand &&
          nextPreviewCommand.line !== currentPreviewCommand?.line
        ) {
          cursorRef.current = {
            anchor: nextPreviewCommand.pos,
            head: nextPreviewCommand.pos,
            fromLine: nextPreviewCommand.line,
            toLine: nextPreviewCommand.line,
          };
          setCursor(cursorRef.current);
          setPreviewCursor(cursorRef.current);
          return true;
        }
      }
      return true;
    }, [getPreviewCommand]);

    useEffect(() => {
      const variableListener = variableValueListenerRef.current;
      return (): void => {
        if (variableListener) {
          gameRef.current.logic.events.onSetVariableValue.removeListener(
            variableListener
          );
          gameRef.current.logic.events.onExecuteBlock.removeListener(
            variableListener
          );
        }
      };
    }, []);

    useEffect(() => {
      if (parseResultState && previewCursor) {
        handlePreviewResult(
          parseResultState,
          previewCursor.anchor,
          previewCursor.fromLine,
          true,
          debug
        );
      }
    }, [previewCursor, debug, handlePreviewResult, parseResultState]);

    useEffect(() => {
      if (mode === "Edit") {
        setExecutingCursor(null);
      }
    }, [mode]);

    const theme = useTheme();

    const backgroundStyle: React.CSSProperties = useMemo(
      () => ({ backgroundColor: colors.background }),
      []
    );

    const style = useMemo(
      () => ({ backgroundColor: theme.colors.darkForeground }),
      [theme]
    );

    const initial = initialRef.current;
    initialRef.current = false;

    return (
      <>
        <StyledContainerScriptEditor style={backgroundStyle}>
          {(transitionState === "idle" ||
            (transitionState === "exit" && !initial)) && (
            <StyledFadeAnimation initial={0} animate={ready ? 1 : 0}>
              <ScriptEditor
                defaultValue={defaultValue}
                defaultState={editor}
                augmentations={augmentations}
                toggleFolding={toggleFolding}
                toggleLinting={toggleLinting}
                runningLine={mode === "Edit" ? null : executingCursor?.fromLine}
                focusFirstError={mode === "Edit"}
                snippetPreview={snippetPreview}
                editorChange={editorChange}
                searchTextQuery={searchTextQuery}
                searchLineQuery={searchLineQuery}
                defaultScrollTopLine={defaultScrollTopLine}
                scrollTopLineOffset={-3}
                cursor={cursor}
                style={style}
                onUpdate={handleUpdate}
                onEditorUpdate={handleEditorUpdate}
                onDocChange={handleDocChange}
                onParse={handleScriptParse}
                onCursor={handleScriptCursor}
                onScrollLine={handleScrollLine}
                onOpenSearchTextPanel={handleOpenSearchTextPanel}
                onCloseSearchTextPanel={handleCloseSearchTextPanel}
                onOpenSearchLinePanel={handleOpenSearchLinePanel}
                onCloseSearchLinePanel={handleCloseSearchLinePanel}
                getRuntimeValue={handleGetRuntimeValue}
                setRuntimeValue={handleSetRuntimeValue}
                observeRuntimeValue={handleObserveRuntimeValue}
                onNavigateUp={handleNavigateUp}
                onNavigateDown={handleNavigateDown}
              />
            </StyledFadeAnimation>
          )}
        </StyledContainerScriptEditor>
      </>
    );
  }
);

export default LogicScriptEditor;
