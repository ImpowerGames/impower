import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { ButtonBase, Typography } from "@material-ui/core";
import React, {
  CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Measure, { ContentRect } from "react-measure";
import CircleQuestionSolidIcon from "../../../../resources/icons/solid/circle-question.svg";
import OctagonXmarkSolidIcon from "../../../../resources/icons/solid/octagon-xmark.svg";
import TriangleExclamationSolidIcon from "../../../../resources/icons/solid/triangle-exclamation.svg";
import { throttle } from "../../../impower-core";
import { ProjectDocument } from "../../../impower-data-store";
import { Player } from "../../../impower-game-player";
import {
  CenterType,
  GameProjectData,
  ScaleModeType,
} from "../../../impower-game/data";
import { LogData } from "../../../impower-game/game";
import { FontIcon } from "../../../impower-icon";
import { TransparencyPattern } from "../../../impower-react-color-picker";
import { VirtualizedItem } from "../../../impower-react-virtualization";
import { AccessibleEvent } from "../../../impower-route";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";
import UnmountAnimation from "../../../impower-route/components/animations/UnmountAnimation";
import PlayerPreview from "../../../impower-route/components/elements/PlayerPreview";
import Page from "../../../impower-route/components/layouts/Page";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import { Breakpoint } from "../../../impower-route/styles/breakpoint";
import { getBreakpoint } from "../../../impower-route/utils/getBreakpoint";
import { getPlaceholderUrl } from "../../../impower-storage";
import { UserContext } from "../../../impower-user";
import { DataContext } from "../../contexts/dataContext";
import { GameContext } from "../../contexts/gameContext";
import { GameRunnerContext } from "../../contexts/gameRunnerContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { panelSetInteraction } from "../../types/actions/panelActions";
import {
  testControlChange,
  testModeChange,
} from "../../types/actions/testActions";
import { Control, Layout, Mode } from "../../types/state/testState";

const StyledMotionTestPanel = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
`;

const StyledTestPanelContent = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const StyledTestPlayer = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;

const StyledOverlay = styled.div`
  pointer-events: none;
  position: absolute;
  top: 50%;
  right: 0;
  bottom: 0;
  left: 0;
`;

const StyledDebugOverlay = styled(FadeAnimation)`
  position: absolute;
  top: ${(props): string => props.theme.spacing(1)};
  right: ${(props): string => props.theme.spacing(1)};
  bottom: ${(props): string => props.theme.spacing(1)};
  left: ${(props): string => props.theme.spacing(1)};

  overflow: auto;

  display: flex;
  flex-direction: column-reverse;
  border-radius: ${(props): string => props.theme.spacing(1)};

  background-color: ${(props): string => props.theme.colors.black85};
  color: white;
`;

const StyledDebugBackground = styled.div`
  border-radius: ${(props): string => props.theme.spacing(1)};
  display: flex;
  flex-direction: column;
`;

const StyledDebugContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const StyledLogLine = styled.div`
  display: flex;
  align-items: center;
  min-height: ${(props): string => props.theme.spacing(4)};
  max-height: ${(props): string => props.theme.spacing(4)};
  pointer-events: auto;
`;

const StyledLogButton = styled(ButtonBase)`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-start;
  border-radius: ${(props): string => props.theme.spacing(0.5)};
  padding: ${(props): string => props.theme.spacing(0.5)}
    ${(props): string => props.theme.spacing(1)};
`;

const StyledLogIcon = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledDebugTypography = styled(Typography)`
  white-space: nowrap;
  font-family: ${(props): string => props.theme.fontFamily.monospace};
  font-weight: ${(props): number => props.theme.fontWeight.medium};
`;

interface LogIconProps {
  severity: "Info" | "Warning" | "Error";
}

const LogIcon = React.memo((props: LogIconProps): JSX.Element | null => {
  const { severity } = props;
  const theme = useTheme();
  switch (severity) {
    case "Info":
      return (
        <StyledLogIcon>
          <FontIcon
            aria-label={severity}
            color={theme.palette.info.light}
            size={theme.fontSize.regular}
          >
            <CircleQuestionSolidIcon />
          </FontIcon>
        </StyledLogIcon>
      );
    case "Warning":
      return (
        <StyledLogIcon>
          <FontIcon
            aria-label={severity}
            color={theme.palette.warning.light}
            size={theme.fontSize.regular}
          >
            <TriangleExclamationSolidIcon />
          </FontIcon>
        </StyledLogIcon>
      );
    case "Error":
      return (
        <StyledLogIcon>
          <FontIcon
            aria-label={severity}
            color={theme.palette.error.light}
            size={theme.fontSize.regular}
          >
            <OctagonXmarkSolidIcon />
          </FontIcon>
        </StyledLogIcon>
      );
    default:
      return null;
  }
});

interface LogLineProps {
  parentBlockId: string;
  blockId: string;
  commandId: string;
  severity: "Info" | "Warning" | "Error";
  message: string;
  style?: CSSProperties;
  onClick?: (
    parentBlockId: string,
    blockId: string,
    commandId: string,
    e: AccessibleEvent
  ) => void;
}

const LogLine = React.memo((props: LogLineProps): JSX.Element => {
  const {
    parentBlockId,
    blockId,
    commandId,
    severity,
    message,
    style,
    onClick = (): void => null,
  } = props;
  return (
    <StyledLogLine style={style}>
      <StyledLogButton
        onClick={(e): void => onClick(parentBlockId, blockId, commandId, e)}
      >
        <LogIcon severity={severity} />
        <StyledDebugTypography>{message}</StyledDebugTypography>
      </StyledLogButton>
    </StyledLogLine>
  );
});

interface TestOverlayProps {
  debug: boolean;
  logs: LogData[];
  onClickLog?: (
    parentBlockId: string,
    blockId: string,
    commandId: string,
    e: AccessibleEvent
  ) => void;
}

const TestOverlay = React.memo((props: TestOverlayProps): JSX.Element => {
  const { debug, logs, onClickLog } = props;
  return (
    <StyledOverlay>
      <UnmountAnimation>
        {debug && (
          <StyledDebugOverlay initial={0} animate={1} exit={0} duration={0.2}>
            <StyledDebugBackground>
              <StyledDebugContent>
                {logs.map((log, index): JSX.Element => {
                  if (!log) {
                    return null;
                  }
                  return (
                    <VirtualizedItem key={log.id} index={index} minHeight={32}>
                      <LogLine
                        parentBlockId={log.parentBlockId}
                        blockId={log.blockId}
                        commandId={log.commandId}
                        severity={log.severity}
                        message={log.message}
                        onClick={onClickLog}
                      />
                    </VirtualizedItem>
                  );
                })}
              </StyledDebugContent>
            </StyledDebugBackground>
          </StyledDebugOverlay>
        )}
      </UnmountAnimation>
    </StyledOverlay>
  );
});

interface TestPlayerProps {
  doc: ProjectDocument;
  project: GameProjectData;
  startTime: number;
  layout: Layout;
  mode: Mode;
  control: Control;
  debug: boolean;
}

const TestPlayer = React.memo((props: TestPlayerProps): JSX.Element => {
  const { project, doc, startTime, layout, mode, control, debug } = props;
  const [playerInitialized, setPlayerInitialized] = useState(false);
  const [state, dispatch] = useContext(ProjectEngineContext);
  const { events } = useContext(DataContext);
  const { gameRunner } = useContext(GameRunnerContext);
  const { game, onCreateGame } = useContext(GameContext);

  const [logs, setLogs] = useState<LogData[]>(
    game?.debug.state.currentLogs || []
  );

  const handlePlayerInitialized = useCallback(() => {
    setPlayerInitialized(true);
  }, []);
  const handleClickPlay = useCallback(() => {
    dispatch(testControlChange("Play"));
    dispatch(testModeChange("Test"));
  }, [dispatch]);

  const getBackgroundPosition = (
    centerType: CenterType
  ): "left top" | "center" | "center top" | "left center" => {
    if (centerType === CenterType.NoCenter) {
      return "left top";
    }
    if (centerType === CenterType.CenterBoth) {
      return "center";
    }
    if (centerType === CenterType.CenterHorizontally) {
      return "center top";
    }
    if (centerType === CenterType.CenterVertically) {
      return "left center";
    }
    return "center";
  };

  const getBackgroundSize = (
    scaleModeType: ScaleModeType
  ): "auto" | "100% auto" | "auto 100%" | "contain" | "cover" | "100% 100%" => {
    if (scaleModeType === ScaleModeType.None) {
      return "auto";
    }
    if (scaleModeType === ScaleModeType.WidthControlsHeight) {
      return "100% auto";
    }
    if (scaleModeType === ScaleModeType.HeightControlsWidth) {
      return "auto 100%";
    }
    if (scaleModeType === ScaleModeType.Fit) {
      return "contain";
    }
    if (scaleModeType === ScaleModeType.Envelop) {
      return "cover";
    }
    if (scaleModeType === ScaleModeType.Resize) {
      return "100% 100%";
    }
    return "cover";
  };

  const handleClickLog = useCallback(
    (
      parentBlockId: string,
      blockId: string,
      commandId: string,
      e: AccessibleEvent
    ) => {
      e.stopPropagation();
      events.onOpenData.emit({ id: parentBlockId });
      const block = project?.instances?.blocks?.data?.[blockId];
      if (block) {
        dispatch(
          panelSetInteraction("Logic", "Selected", [block.reference.refId])
        );
      }
      window.setTimeout(
        () => events.onFocusData.emit({ ids: [blockId, commandId] }),
        200
      );
    },
    [events, project, dispatch]
  );

  useEffect(() => {
    setLogs(game?.debug.state.currentLogs || []);
    const onLog = throttle((): void => {
      if (game) {
        setLogs([...game.debug.state.currentLogs]);
      }
    }, 200);
    if (game) {
      game.debug.events.onLog.addListener(onLog);
    }
    return (): void => {
      if (game) {
        game.debug.events.onLog.removeListener(onLog);
      }
    };
  }, [game]);

  return (
    <StyledTestPlayer>
      <TransparencyPattern
        style={
          playerInitialized
            ? undefined
            : { backgroundColor: "black", backgroundImage: "none" }
        }
      />
      <Player
        startTime={startTime}
        active={mode === "Test"}
        control={control}
        project={project}
        game={game}
        gameBucketFolderId={state?.project?.id}
        runner={gameRunner}
        logoSrc="/logo.png"
        onInitialized={handlePlayerInitialized}
        onCreateGame={onCreateGame}
      >
        {mode === "Edit" && layout === "Page" && (
          <PlayerPreview
            doc={doc}
            backgroundPosition={getBackgroundPosition(
              project?.instances?.configs?.data?.ScaleConfig?.autoCenter
            )}
            backgroundSize={getBackgroundSize(
              project?.instances?.configs?.data?.ScaleConfig?.mode
            )}
            onPlay={handleClickPlay}
          />
        )}
      </Player>
      <TestOverlay debug={debug} logs={logs} onClickLog={handleClickLog} />
    </StyledTestPlayer>
  );
});

interface TestPanelContentProps {
  uid: string;
  docId: string;
  doc: ProjectDocument;
  project: GameProjectData;
  startTime: number;
  layout: Layout;
  mode: Mode;
  control: Control;
  debug: boolean;
  fullscreenPlayer?: boolean;
}

const TestPanelContent = React.memo(
  (props: TestPanelContentProps): JSX.Element => {
    const {
      uid,
      docId,
      doc,
      project,
      startTime,
      layout,
      mode,
      control,
      debug,
      fullscreenPlayer,
    } = props;
    const [breakpoint, setBreakpoint] = useState<Breakpoint>(Breakpoint.xs);
    const scrollParentRef = useRef<HTMLDivElement>(null);
    const handleResize = useCallback((contentRect: ContentRect): void => {
      if (contentRect.bounds) {
        setBreakpoint(getBreakpoint(contentRect.bounds.width));
      }
    }, []);
    const width = project?.instances?.configs?.data?.ScaleConfig?.width;
    const height = project?.instances?.configs?.data?.ScaleConfig?.height;

    const theme = useTheme();

    return (
      <StyledTestPanelContent
        ref={scrollParentRef}
        style={{
          marginBottom: theme.minHeight.navigationBar,
        }}
      >
        <Measure bounds onResize={handleResize}>
          {({ measureRef }): JSX.Element => (
            <Page
              innerRef={measureRef}
              docId={docId}
              doc={doc}
              uid={uid}
              playerAspectRatio={height / width}
              breakpoint={breakpoint}
              fullscreenPlayer={fullscreenPlayer}
              getPlaceholderUrl={getPlaceholderUrl}
              preview
            >
              <TestPlayer
                doc={doc}
                project={project}
                startTime={startTime}
                layout={layout}
                mode={mode}
                control={control}
                debug={debug}
              />
            </Page>
          )}
        </Measure>
      </StyledTestPanelContent>
    );
  }
);

const TestPanel = React.memo((): JSX.Element => {
  const [userState] = useContext(UserContext);
  const [state] = useContext(ProjectEngineContext);

  const uid = userState?.uid;

  const id = state.project?.id;
  const data = state.project?.data;
  const doc = state.project?.data?.doc;
  const playerVisibility = state?.test?.playerVisibility;
  const startTime = state?.test?.startTime;
  const mode = state?.test?.mode;
  const control = state?.test?.control;
  const debug = state?.test?.debug;
  const layout = state?.test?.layout;

  const theme = useTheme();

  const backgroundColor = doc.backgroundHex;

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);

  return (
    <StyledMotionTestPanel
      initial={1}
      animate={playerVisibility ? 1 : 0}
      style={{ backgroundColor }}
    >
      <TestPanelContent
        uid={uid}
        docId={id}
        doc={doc}
        project={data}
        startTime={startTime}
        layout={layout}
        mode={mode}
        control={control}
        debug={debug}
        fullscreenPlayer={layout === "Game"}
      />
    </StyledMotionTestPanel>
  );
});

export default TestPanel;
