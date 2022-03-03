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
import { getRuntimeCommand } from "../../../impower-game/parser";
import { FadeAnimation } from "../../../impower-route";
import {
  FountainParseResult,
  parseFountain,
} from "../../../impower-script-parser";
import { GameContext } from "../../contexts/gameContext";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  dataPanelSearch,
  dataPanelSetCursor,
  dataPanelSetScrollTopLine,
} from "../../types/actions/dataPanelActions";
import { projectChangeScript } from "../../types/actions/projectActions";
import {
  DataPanelType,
  DataWindowType,
} from "../../types/state/dataPanelState";
import { Mode } from "../../types/state/testState";

const ScriptEditor = dynamic(
  () => import("../../../impower-script-editor/components/ScriptEditor"),
  {
    ssr: false,
  }
);

const StyledLogicScriptEditor = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background-color: ${(props): string => props.theme.colors.black30};
`;

interface LogicScriptEditorProps {
  toggleFolding: boolean;
  onSectionChange: (name: string) => void;
}

const LogicScriptEditor = React.memo(
  (props: LogicScriptEditorProps): JSX.Element => {
    const { toggleFolding, onSectionChange } = props;

    const [state, dispatch] = useContext(ProjectEngineContext);
    const { transitionState } = useContext(WindowTransitionContext);
    const { gameInspector } = useContext(GameInspectorContext);
    const { game } = useContext(GameContext);

    const windowType = state?.present?.window
      ?.type as unknown as DataWindowType;
    const searchQuery =
      state?.present?.dataPanel?.panels?.[windowType]?.Container?.searchQuery;
    const mode = state?.present?.test?.mode;
    const id = state?.present?.project?.id;
    const defaultValue =
      state?.present?.project?.data?.scripts?.logic?.data?.root || "";
    const events = game?.logic?.events;
    const defaultScrollTopLine =
      state?.present?.dataPanel?.panels?.Logic?.Container?.scrollTopLine;

    const initialRef = useRef(true);
    const cursorRef = useRef<{
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    }>();
    const scriptValueRef = useRef<string>();
    const scrollTopLineRef = useRef<number>();
    const parseResultRef = useRef<FountainParseResult>();
    const currentSectionNameRef = useRef<string>();

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

    const handleSearch = useCallback(
      (
        e?: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
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
      ) => {
        dispatch(
          dataPanelSearch(windowType, DataPanelType.Container, searchQuery)
        );
      },
      [dispatch, windowType]
    );

    const handleScriptParse = useCallback((result: FountainParseResult) => {
      parseResultRef.current = result;
      setParseResultState(parseResultRef.current);
    }, []);

    const handleSaveScriptChange = useCallback(() => {
      const newValue = scriptValueRef.current;
      dispatch(projectChangeScript(id, "logic", newValue));
    }, [dispatch, id]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedScriptChange = useCallback(
      debounce(handleSaveScriptChange, 500),
      [handleSaveScriptChange]
    );

    const handleScriptChange = useCallback(
      (value: string) => {
        scriptValueRef.current = value;
        handleDebouncedScriptChange();
      },
      [handleDebouncedScriptChange]
    );

    const handleSaveScriptCursor = useCallback(() => {
      const cursor = cursorRef.current;
      dispatch(dataPanelSetCursor(windowType, cursor));
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
        if (mode === Mode.Test) {
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
      dispatch(dataPanelSetScrollTopLine(windowType, scrollTopLine));
    }, [dispatch, windowType]);

    const debouncedSaveScrollTopLineRef = useRef(
      debounce(handleSaveScrollTopLine, 200)
    );

    const handleScrollLine = useCallback(
      (e: Event, firstVisibleLine: number) => {
        scrollTopLineRef.current = firstVisibleLine;
        if (!parseResultRef.current) {
          parseResultRef.current = parseFountain(scriptValueRef.current);
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
      [onSectionChange]
    );

    const handlePreviewResult = useCallback(
      (result: FountainParseResult, line: number) => {
        if (line != null) {
          let tokenIndex = result.scriptLines[line];
          let token = result.scriptTokens[tokenIndex];
          if (token) {
            const skip = ["character", "note", "parenthetical"];
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
            const runtimeCommand = getRuntimeCommand(
              token,
              sectionId,
              result.variables,
              result.assets
            );
            if (runtimeCommand) {
              const commandInspector = gameInspector.getInspector(
                runtimeCommand.reference
              );
              if (commandInspector) {
                commandInspector.onPreview(runtimeCommand);
              }
            }
          }
        }
      },
      [gameInspector]
    );

    useEffect(() => {
      if (mode === Mode.Edit && parseResultState && previewCursor) {
        handlePreviewResult(parseResultState, previewCursor.fromLine);
      }
    }, [parseResultState, previewCursor, mode, handlePreviewResult]);

    const initial = initialRef.current;

    initialRef.current = false;

    const theme = useTheme();

    const style = useMemo(
      () => ({ backgroundColor: theme.colors.darkForeground }),
      [theme]
    );

    return (
      <StyledLogicScriptEditor>
        {(transitionState === "idle" ||
          (transitionState === "exit" && !initial)) && (
          <FadeAnimation initial={0} animate={1}>
            <ScriptEditor
              toggleFolding={toggleFolding}
              searchQuery={searchQuery}
              defaultScrollTopLine={defaultScrollTopLine}
              defaultValue={defaultValue}
              scrollTopLineOffset={-3}
              cursor={executingCursor}
              style={style}
              onChange={handleScriptChange}
              onParse={handleScriptParse}
              onCursor={handleScriptCursor}
              onScrollLine={handleScrollLine}
              onSearch={handleSearch}
            />
          </FadeAnimation>
        )}
      </StyledLogicScriptEditor>
    );
  }
);

export default LogicScriptEditor;
