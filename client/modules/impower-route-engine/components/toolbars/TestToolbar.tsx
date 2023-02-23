import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import BrowserRegularIcon from "../../../../resources/icons/regular/browser.svg";
import BugSlashRegularIcon from "../../../../resources/icons/regular/bug-slash.svg";
import BugRegularIcon from "../../../../resources/icons/regular/bug.svg";
import CirclePlayRegularIcon from "../../../../resources/icons/regular/circle-play.svg";
import CircleQuestionRegularIcon from "../../../../resources/icons/regular/circle-question.svg";
import CompressRegularIcon from "../../../../resources/icons/regular/compress.svg";
import DownloadRegularIcon from "../../../../resources/icons/regular/download.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import ExpandRegularIcon from "../../../../resources/icons/regular/expand.svg";
import GamepadRegularIcon from "../../../../resources/icons/regular/gamepad.svg";
import TrianglePersonDiggingRegularIcon from "../../../../resources/icons/regular/triangle-person-digging.svg";
import UploadRegularIcon from "../../../../resources/icons/regular/upload.svg";
import BackwardStepSolidIcon from "../../../../resources/icons/solid/backward-step.svg";
import BackwardSolidIcon from "../../../../resources/icons/solid/backward.svg";
import ForwardStepSolidIcon from "../../../../resources/icons/solid/forward-step.svg";
import ForwardSolidIcon from "../../../../resources/icons/solid/forward.svg";
import PauseSolidIcon from "../../../../resources/icons/solid/pause.svg";
import PlaySolidIcon from "../../../../resources/icons/solid/play.svg";
import { throttle } from "../../../impower-core";
import { isGameDocument } from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import { ScreenContext } from "../../../impower-route";
import ContextMenu from "../../../impower-route/components/popups/ContextMenu";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import {
  testDebug,
  testLayoutChange,
  testModeChange,
  testPause,
  testStep,
} from "../../types/actions/testActions";
import { Mode } from "../../types/state/testState";
import { WindowType } from "../../types/state/windowState";

export enum GamePreviewMenuItemType {
  Page = "Page",
  Debug = "Debug",
  SaveGameState = "SaveGameState",
  LoadGameState = "LoadGameState",
}

const StyledToolbar = styled.div`
  display: flex;
  min-height: 0;
  flex: 1;
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${(props): string => props.theme.colors.black40};
  margin-bottom: -1px;
  padding: 0 ${(props): string => props.theme.spacing(1.5)};
`;

const StyledPlaybackControls = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const StyledLeftArea = styled.div`
  flex: 2;
  display: flex;
  justify-content: flex-start;
`;

const StyledRightArea = styled.div`
  flex: 2;
  display: flex;
  justify-content: flex-end;
`;

const StyledButtonContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: ${(props): string => props.theme.spacing(0.25)};
`;

const StyledButtonTypography = styled(Typography)`
  padding-top: ${(props): string => props.theme.spacing(0.5)};
  font-size: ${(props): string => props.theme.fontSize.small};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  line-height: 1;
`;

const StyledTitleTypography = styled(Typography)`
  flex: 1;
  display: flex;
  justify-content: center;
  opacity: 0.8;
  white-space: nowrap;
`;

interface PlaybackControlsProps {
  paused: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStepBackwardDown: () => void;
  onStepBackwardUp: () => void;
  onFastBackwardDown: () => void;
  onFastBackwardUp: () => void;
  onStepForwardDown: () => void;
  onStepForwardUp: () => void;
  onFastForwardDown: () => void;
  onFastForwardUp: () => void;
}

const PlaybackControls = React.memo(
  (props: PlaybackControlsProps): JSX.Element => {
    const {
      paused,
      onPlay,
      onPause,
      onStepBackwardDown,
      onStepBackwardUp,
      onFastBackwardDown,
      onFastBackwardUp,
      onStepForwardDown,
      onStepForwardUp,
      onFastForwardDown,
      onFastForwardUp,
    } = props;

    const theme = useTheme();

    return (
      <StyledPlaybackControls>
        <IconButton
          onPointerDown={onStepBackwardDown}
          onPointerUp={onStepBackwardUp}
        >
          <FontIcon
            aria-label="Step Backward"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <BackwardStepSolidIcon />
          </FontIcon>
        </IconButton>
        <IconButton
          onPointerDown={onFastBackwardDown}
          onPointerUp={onFastBackwardUp}
        >
          <FontIcon
            aria-label="Rewind"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <BackwardSolidIcon />
          </FontIcon>
        </IconButton>
        <IconButton onClick={paused ? onPlay : onPause}>
          <FontIcon
            aria-label={paused ? "Play" : "Pause"}
            size={24}
            color={theme.colors.white40}
          >
            {paused ? <PlaySolidIcon /> : <PauseSolidIcon />}
          </FontIcon>
        </IconButton>
        <IconButton
          onPointerDown={onFastForwardDown}
          onPointerUp={onFastForwardUp}
        >
          <FontIcon
            aria-label="Fast Forward"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <ForwardSolidIcon />
          </FontIcon>
        </IconButton>
        <IconButton
          onPointerDown={onStepForwardDown}
          onPointerUp={onStepForwardUp}
        >
          <FontIcon
            aria-label="Step Forward"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <ForwardStepSolidIcon />
          </FontIcon>
        </IconButton>
      </StyledPlaybackControls>
    );
  }
);

interface TestToolbarProps {
  windowType: WindowType;
}

const TestToolbar = React.memo((props: TestToolbarProps): JSX.Element => {
  const { windowType } = props;

  const { fullscreen, setFullscreen } = useContext(ScreenContext);
  const [state, dispatch] = useContext(ProjectEngineContext);

  const doc = state.project?.data?.doc;

  const { mode, paused, debug, layout, compiling } = state.test;

  const isCompiling = compiling[windowType];

  const theme = useTheme();

  const menuOptions: {
    key: string;
    label: string;
    icon: React.ReactNode;
  }[] = useMemo(
    () => [
      layout === "Game"
        ? {
            key: "preview_page",
            label: "Preview Page",
            icon: <BrowserRegularIcon />,
          }
        : {
            key: "preview_game",
            label: "Preview Game",
            icon: <GamepadRegularIcon />,
          },
      debug
        ? {
            key: "debug_disable",
            label: "Disable Debug",
            icon: <BugSlashRegularIcon />,
          }
        : {
            key: "debug_enable",
            label: "Enable Debug",
            icon: <BugRegularIcon />,
          },
      {
        key: "save",
        label: "Save Game",
        icon: <DownloadRegularIcon />,
      },
      { key: "load", label: "Load Game", icon: <UploadRegularIcon /> },
    ],
    [debug, layout]
  );

  const menuAnchorElRef = useRef<HTMLDivElement | null>(null);
  const menuOptionsRef = useRef(menuOptions);
  const [menuOpen, setMenuOpen] = useState(false);
  const timeoutHandleRef = useRef<number>();

  const handlePlay = useCallback((): void => {
    dispatch(testPause(false));
  }, [dispatch]);
  const handlePause = useCallback((): void => {
    dispatch(testPause(true));
  }, [dispatch]);
  const handleStepBackward = useCallback(() => {
    dispatch(testPause(true));
    dispatch(testStep(-10));
  }, [dispatch]);
  const handleStepForward = useCallback(() => {
    dispatch(testStep(10));
  }, [dispatch]);
  const handleFastBackward = useCallback(() => {
    dispatch(testPause(true));
    dispatch(testStep(-100));
  }, [dispatch]);
  const handleFastForward = useCallback(() => {
    dispatch(testStep(100));
  }, [dispatch]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleThrottledStepBackward = useCallback(
    throttle(handleStepBackward, 100),
    [handleStepBackward]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleThrottledStepForward = useCallback(
    throttle(handleStepForward, 100),
    [handleStepForward]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleThrottledFastBackward = useCallback(
    throttle(handleFastBackward, 100),
    [handleFastBackward]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleThrottledFastForward = useCallback(
    throttle(handleFastForward, 100),
    [handleFastForward]
  );
  const handleStepBackwardDown = useCallback((): void => {
    window.cancelAnimationFrame(timeoutHandleRef.current);
    const loop = (): void => {
      handleThrottledStepBackward();
      timeoutHandleRef.current = window.requestAnimationFrame(loop);
    };
    timeoutHandleRef.current = window.requestAnimationFrame(loop);
  }, [handleThrottledStepBackward]);
  const handleStepForwardDown = useCallback((): void => {
    window.cancelAnimationFrame(timeoutHandleRef.current);
    const loop = (): void => {
      handleThrottledStepForward();
      timeoutHandleRef.current = window.requestAnimationFrame(loop);
    };
    timeoutHandleRef.current = window.requestAnimationFrame(loop);
  }, [handleThrottledStepForward]);
  const handleFastBackwardDown = useCallback((): void => {
    window.cancelAnimationFrame(timeoutHandleRef.current);
    const loop = (): void => {
      handleThrottledFastBackward();
      timeoutHandleRef.current = window.requestAnimationFrame(loop);
    };
    timeoutHandleRef.current = window.requestAnimationFrame(loop);
  }, [handleThrottledFastBackward]);
  const handleFastForwardDown = useCallback((): void => {
    window.cancelAnimationFrame(timeoutHandleRef.current);
    const loop = (): void => {
      handleThrottledFastForward();
      timeoutHandleRef.current = window.requestAnimationFrame(loop);
    };
    timeoutHandleRef.current = window.requestAnimationFrame(loop);
  }, [handleThrottledFastForward]);
  const handlePlaybackStop = useCallback((): void => {
    window.cancelAnimationFrame(timeoutHandleRef.current);
  }, []);
  const handleChangeTestMode = useCallback(
    (m: Mode): void => {
      if (mode === "Test") {
        dispatch(testPause(false));
      }
      dispatch(testModeChange(m));
    },
    [dispatch, mode]
  );
  const handleFullscreen = useCallback(
    (value: boolean): void => {
      setFullscreen(value);
    },
    [setFullscreen]
  );
  const handleDebug = useCallback(
    (value: boolean): void => {
      dispatch(testDebug(value));
    },
    [dispatch]
  );
  const handleView = useCallback(
    (layout: "Page" | "Game"): void => {
      dispatch(testLayoutChange(layout));
    },
    [dispatch]
  );

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setMenuOpen(currState.m === "options");
      }
    },
    []
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleCloseContextMenu = useCallback((): void => {
    setMenuOpen(false);
    closeMenuDialog();
  }, [closeMenuDialog]);

  const handleOpenContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      menuAnchorElRef.current = e.currentTarget as HTMLDivElement;
      menuOptionsRef.current = menuOptions;
      setMenuOpen(true);
      openMenuDialog("options");
    },
    [menuOptions, openMenuDialog]
  );

  const handleClickMenu = useCallback(
    (e: React.MouseEvent<Element, MouseEvent>, type: string) => {
      if (type === "preview_page") {
        handleView("Page");
      }
      if (type === "preview_game") {
        handleView("Game");
      }
      if (type === "debug_enable") {
        handleDebug(true);
      }
      if (type === "debug_disable") {
        handleDebug(false);
      }
    },
    [handleDebug, handleView]
  );

  const isPlayable = isGameDocument(doc);
  const modeTooltip = mode === "Edit" ? "Test Game" : "Edit Game";

  const menuItemKeys = useMemo(
    () => (isPlayable ? Object.keys(menuOptions) : []),
    [isPlayable, menuOptions]
  );

  const title = layout === "Page" ? "Page Preview" : "Game Preview";

  return (
    <StyledToolbar
      style={{
        backgroundColor: mode === "Test" ? "black" : undefined,
      }}
    >
      <StyledLeftArea>
        {isPlayable && windowType !== "test" && (
          <IconButton
            onClick={(): void =>
              handleChangeTestMode(mode === "Edit" ? "Test" : "Edit")
            }
            disabled={isCompiling}
            style={{
              color: theme.colors.white40,
            }}
          >
            <StyledButtonContent>
              <FontIcon
                aria-label={modeTooltip}
                size={theme.fontSize.smallerIcon}
              >
                {mode === "Edit" ? (
                  isCompiling ? (
                    <CircleQuestionRegularIcon />
                  ) : (
                    <CirclePlayRegularIcon />
                  )
                ) : (
                  <TrianglePersonDiggingRegularIcon />
                )}
              </FontIcon>
              <StyledButtonTypography>
                {mode === "Edit" ? "PLAY" : "EDIT"}
              </StyledButtonTypography>
            </StyledButtonContent>
          </IconButton>
        )}
        {(!isPlayable || windowType === "test") && (
          <IconButton
            onClick={(): void => handleFullscreen(!fullscreen)}
            style={{ color: theme.colors.white40 }}
          >
            <FontIcon
              aria-label={fullscreen ? "Windowed Mode" : "Fullscreen Mode"}
              size={24}
            >
              {fullscreen ? <CompressRegularIcon /> : <ExpandRegularIcon />}
            </FontIcon>
          </IconButton>
        )}
      </StyledLeftArea>
      {mode === "Edit" && (
        <StyledTitleTypography>{title}</StyledTitleTypography>
      )}
      {mode === "Test" && (
        <PlaybackControls
          paused={paused}
          onStepBackwardDown={handleStepBackwardDown}
          onStepBackwardUp={handlePlaybackStop}
          onFastBackwardDown={handleFastBackwardDown}
          onFastBackwardUp={handlePlaybackStop}
          onStepForwardDown={handleStepForwardDown}
          onStepForwardUp={handlePlaybackStop}
          onFastForwardDown={handleFastForwardDown}
          onFastForwardUp={handlePlaybackStop}
          onPlay={handlePlay}
          onPause={handlePause}
        />
      )}
      <StyledRightArea ref={menuAnchorElRef}>
        {menuItemKeys?.length > 0 && (
          <>
            <IconButton
              onClick={handleOpenContextMenu}
              style={{ color: theme.colors.white40 }}
            >
              <FontIcon
                aria-label="More Options"
                size={theme.fontSize.smallIcon}
              >
                <EllipsisVerticalRegularIcon />
              </FontIcon>
            </IconButton>
            <ContextMenu
              anchorReference="anchorEl"
              anchorEl={menuAnchorElRef.current}
              options={menuOptionsRef.current}
              open={menuOpen}
              onOption={handleClickMenu}
              onClose={handleCloseContextMenu}
            />
          </>
        )}
      </StyledRightArea>
    </StyledToolbar>
  );
});

export default TestToolbar;
