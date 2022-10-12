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
import {
  CenterType,
  GameProjectData,
  LogData,
  ScaleModeType,
} from "../../../../../spark-engine";
import CircleQuestionSolidIcon from "../../../../resources/icons/solid/circle-question.svg";
import OctagonXmarkSolidIcon from "../../../../resources/icons/solid/octagon-xmark.svg";
import TriangleExclamationSolidIcon from "../../../../resources/icons/solid/triangle-exclamation.svg";
import { throttle } from "../../../impower-core";
import { ProjectDocument } from "../../../impower-data-store";
import { Player } from "../../../impower-game-player";
import { FontIcon } from "../../../impower-icon";
import { TransparencyPattern } from "../../../impower-react-color-picker";
import { VirtualizedItem } from "../../../impower-react-virtualization";
import {
  AccessibleEvent,
  BottomNavigationBarSpacer,
} from "../../../impower-route";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";
import PlayerPreview from "../../../impower-route/components/elements/PlayerPreview";
import Page from "../../../impower-route/components/layouts/Page";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../../impower-route/hooks/useHTMLOverscrollBehavior";
import { Breakpoint } from "../../../impower-route/styles/breakpoint";
import { getBreakpoint } from "../../../impower-route/utils/getBreakpoint";
import { getPlaceholderUrl } from "../../../impower-storage";
import { UserContext } from "../../../impower-user";
import { DataContext } from "../../contexts/dataContext";
import { GameContext } from "../../contexts/gameContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { panelSetInteraction } from "../../types/actions/panelActions";
import { testModeChange, testPause } from "../../types/actions/testActions";
import { Layout, Mode } from "../../types/state/testState";

const StyledMotionTestPanel = styled.div`
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

const StyledTestPlayerContent = styled.div`
  flex: 1;
  position: relative;
`;

const StyledOverlay = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 50%;
  left: 0;
  margin: ${(props): string => props.theme.spacing(1)};
  display: flex;
  flex-direction: column;
  overflow: auto;
  color: white;
`;

const StyledDebugOverlay = styled(FadeAnimation)`
  display: flex;
  flex-direction: column;
  border-radius: ${(props): string => props.theme.spacing(1)};
  background-color: ${(props): string => props.theme.colors.black85};
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
    </StyledOverlay>
  );
});

interface TestPlayerProps {
  doc: ProjectDocument;
  project: GameProjectData;
  layout: Layout;
  mode: Mode;
  paused: boolean;
  debug: boolean;
}

const TestPlayer = React.memo((props: TestPlayerProps): JSX.Element => {
  const { project, doc, layout, mode, paused, debug } = props;
  const [, dispatch] = useContext(ProjectEngineContext);
  const { events } = useContext(DataContext);
  const context = useContext(GameContext);

  const [logs, setLogs] = useState<LogData[]>(
    context?.game?.debug.state.currentLogs || []
  );

  const handleClickPlay = useCallback(() => {
    dispatch(testPause(false));
    dispatch(testModeChange("Test"));
  }, [dispatch]);

  const getBackgroundPosition = (
    centerType: CenterType
  ): "left top" | "center" | "center top" | "left center" => {
    if (centerType === "NoCenter") {
      return "left top";
    }
    if (centerType === "CenterBoth") {
      return "center";
    }
    if (centerType === "CenterHorizontally") {
      return "center top";
    }
    if (centerType === "CenterVertically") {
      return "left center";
    }
    return "center";
  };

  const getBackgroundSize = (
    scaleModeType: ScaleModeType
  ): "auto" | "100% auto" | "auto 100%" | "contain" | "cover" | "100% 100%" => {
    if (scaleModeType === "None") {
      return "auto";
    }
    if (scaleModeType === "WidthControlsHeight") {
      return "100% auto";
    }
    if (scaleModeType === "HeightControlsWidth") {
      return "auto 100%";
    }
    if (scaleModeType === "Fit") {
      return "contain";
    }
    if (scaleModeType === "Envelop") {
      return "cover";
    }
    if (scaleModeType === "Resize") {
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
        dispatch(panelSetInteraction("logic", "Selected", [blockId]));
      }
      window.setTimeout(
        () => events.onFocusData.emit({ ids: [blockId, commandId] }),
        200
      );
    },
    [events, project, dispatch]
  );

  useEffect(() => {
    setLogs(context?.game?.debug.state.currentLogs || []);
    const onLog = throttle((): void => {
      if (context?.game) {
        setLogs([...context.game.debug.state.currentLogs]);
      }
    }, 200);
    if (context?.game) {
      context?.game.debug.events.onLog.addListener(onLog);
    }
    return (): void => {
      if (context?.game) {
        context?.game.debug.events.onLog.removeListener(onLog);
      }
    };
  }, [context?.game]);

  return (
    <StyledTestPlayer>
      <TransparencyPattern />
      <StyledTestPlayerContent>
        <Player paused={paused} context={context}>
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
      </StyledTestPlayerContent>
      <BottomNavigationBarSpacer />
    </StyledTestPlayer>
  );
});

interface TestPanelContentProps {
  uid: string;
  docId: string;
  doc: ProjectDocument;
  project: GameProjectData;
  layout: Layout;
  mode: Mode;
  paused: boolean;
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
      layout,
      mode,
      paused,
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

    return (
      <StyledTestPanelContent ref={scrollParentRef}>
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
                layout={layout}
                mode={mode}
                paused={paused}
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
  const mode = state?.test?.mode;
  const paused = state?.test?.paused;
  const debug = state?.test?.debug;
  const layout = state?.test?.layout;

  const theme = useTheme();

  const backgroundColor = doc.backgroundHex;

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);
  useHTMLOverscrollBehavior("contain");

  return (
    <StyledMotionTestPanel style={{ backgroundColor }}>
      <TestPanelContent
        uid={uid}
        docId={id}
        doc={doc}
        project={data}
        layout={layout}
        mode={mode}
        paused={paused}
        debug={debug}
        fullscreenPlayer={layout === "Game"}
      />
    </StyledMotionTestPanel>
  );
});

export default TestPanel;
