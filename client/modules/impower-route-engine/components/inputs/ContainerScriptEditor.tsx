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
import { debounce } from "../../../impower-core";
import { evaluate } from "../../../impower-evaluate";
import {
  getRuntimeCommand,
  getScriptAugmentations,
} from "../../../impower-game/parser";
import {
  BottomNavigationBarSpacer,
  FadeAnimation,
} from "../../../impower-route";
import {
  colors,
  SearchLineQuery,
  SearchTextQuery,
} from "../../../impower-script-editor";
import { SerializableEditorState } from "../../../impower-script-editor/types/editor";
import {
  FountainParseResult,
  getGlobalEvaluationContext,
  getScopedContext,
  parseFountain,
} from "../../../impower-script-parser";
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
import { WindowType } from "../../types/state/windowState";

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

interface ContainerScriptEditorProps {
  windowType: WindowType;
  toggleFolding: boolean;
  toggleLinting: boolean;
  onSectionChange: (name: string) => void;
}

const ContainerScriptEditor = React.memo(
  (props: ContainerScriptEditorProps): JSX.Element => {
    const { windowType, toggleFolding, toggleLinting, onSectionChange } = props;

    const { portrait, transitionState } = useContext(WindowTransitionContext);
    const { gameInspector } = useContext(GameInspectorContext);
    const { game } = useContext(GameContext);
    const [state, dispatch] = useContext(ProjectEngineContext);

    const events = windowType === "Logic" ? game?.logic?.events : undefined;

    const searchTextQuery = state?.panel?.panels?.[windowType]?.searchTextQuery;
    const searchLineQuery = state?.panel?.panels?.[windowType]?.searchLineQuery;
    const mode = state?.test?.mode;
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
    const parseResultRef = useRef<FountainParseResult>();
    const currentSectionNameRef = useRef<string>();
    const gameRef = useRef(game);
    gameRef.current = game;

    const [parseResultState, setParseResultState] =
      useState<FountainParseResult>();
    const [executingCursor, setExecutingCursor] = useState<{
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    }>();
    const [previewCursor, setPreviewCursor] = useState<{
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    }>();

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

    const handleScriptParse = useCallback((result: FountainParseResult) => {
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

    const handleScriptChange = useCallback(
      (value: string, state: SerializableEditorState) => {
        const canUndo = state?.history?.done?.length > 1;
        const canRedo = state?.history?.undone?.length > 0;
        const focused = state?.focused;
        const selected = state?.selected;
        const diagnostics = state?.diagnostics;
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
        const focusedOtherInput =
          focusChanged &&
          !focused &&
          document?.activeElement?.tagName?.toLowerCase() === "input";
        if (
          canUndoChanged ||
          canRedoChanged ||
          focusChanged ||
          selectedChanged ||
          diagnosticsChanged
        ) {
          // Save editor change immediately so undo/redo button reflects change.
          if (!focusedOtherInput) {
            lastEditorStateRef.current = state;
            handleSaveEditorChange();
          }
        } else {
          lastEditorStateRef.current = state;
          handleDebouncedEditorChange();
        }
        if (scriptValueRef.current !== value) {
          scriptValueRef.current = value;
          handleDebouncedScriptChange();
        }
      },
      [
        handleDebouncedEditorChange,
        handleDebouncedScriptChange,
        handleSaveEditorChange,
      ]
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
          return;
        }
        if (cursorRef.current?.fromLine !== range.fromLine) {
          cursorRef.current = range;
          setPreviewCursor(cursorRef.current);
          handleDebouncedScriptCursor();
        }
      },
      [handleDebouncedScriptCursor, mode]
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
          parseResultRef.current = parseFountain(
            scriptValueRef.current,
            augmentations
          );
        }
        const parseResult = parseResultRef.current;
        const firstVisibleTokenIndex =
          parseResult?.scriptLines?.[firstVisibleLine];
        if (firstVisibleTokenIndex >= 0) {
          let lastSectionName = "";
          for (let i = firstVisibleTokenIndex - 2; i >= 0; i -= 1) {
            const token = parseResult?.scriptTokens?.[i];
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

    const handlePreviewResult = useCallback(
      (result: FountainParseResult, line: number) => {
        if (line != null) {
          let tokenIndex = result.scriptLines[line];
          let token = result.scriptTokens[tokenIndex];
          if (token) {
            const skip = ["dialogue_asset", "character", "parenthetical"];
            while (
              tokenIndex < result.scriptTokens.length &&
              skip.includes(token.type)
            ) {
              tokenIndex += 1;
              token = result.scriptTokens[tokenIndex];
            }
            const sectionEntries = Object.entries(result.sections || {});
            let sectionId = "";
            for (let i = 0; i < sectionEntries.length; i += 1) {
              const [id, section] = sectionEntries[i];
              if (section.line <= line) {
                sectionId = id;
              } else {
                break;
              }
            }
            const runtimeCommand = getRuntimeCommand(token, sectionId);
            if (runtimeCommand) {
              const commandInspector = gameInspector.getInspector(
                runtimeCommand.reference
              );
              if (commandInspector) {
                const [, valueMap] = getScopedContext<string>(
                  sectionId,
                  result?.sections,
                  "assets"
                );
                commandInspector.onPreview(runtimeCommand, { valueMap });
              }
            }
          }
        }
      },
      [gameInspector]
    );

    const handleGetRuntimeValue = useCallback(
      (id: string): string | number | boolean => {
        if (!gameRef.current) {
          return undefined;
        }
        const result = parseResultRef.current;
        const runtimeValue = gameRef.current.getRuntimeValue(id);
        const context = getGlobalEvaluationContext(result);
        const initialValue = context?.[id];
        return runtimeValue != null ? runtimeValue : initialValue;
      },
      []
    );

    const handleSetRuntimeValue = useCallback(
      (id: string, expression: string): void => {
        if (!gameRef.current) {
          return;
        }
        const value = evaluate({}, expression);
        gameRef.current.setRuntimeValue(id, value);
      },
      []
    );

    useEffect(() => {
      if (mode === "Edit" && parseResultState && previewCursor) {
        handlePreviewResult(parseResultState, previewCursor.fromLine);
      }
    }, [parseResultState, previewCursor, mode, handlePreviewResult]);

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
            <StyledFadeAnimation initial={0} animate={1}>
              <ScriptEditor
                defaultValue={defaultValue}
                defaultState={editor}
                augmentations={augmentations}
                toggleFolding={toggleFolding}
                toggleLinting={toggleLinting}
                editorChange={editorChange}
                searchTextQuery={searchTextQuery}
                searchLineQuery={searchLineQuery}
                defaultScrollTopLine={defaultScrollTopLine}
                scrollTopLineOffset={-3}
                cursor={executingCursor}
                style={style}
                onChange={handleScriptChange}
                onParse={handleScriptParse}
                onCursor={handleScriptCursor}
                onScrollLine={handleScrollLine}
                onOpenSearchTextPanel={handleOpenSearchTextPanel}
                onCloseSearchTextPanel={handleCloseSearchTextPanel}
                onOpenSearchLinePanel={handleOpenSearchLinePanel}
                onCloseSearchLinePanel={handleCloseSearchLinePanel}
                getRuntimeValue={handleGetRuntimeValue}
                setRuntimeValue={handleSetRuntimeValue}
              />
            </StyledFadeAnimation>
          )}
          {!portrait && <BottomNavigationBarSpacer />}
        </StyledContainerScriptEditor>
      </>
    );
  }
);

export default ContainerScriptEditor;
